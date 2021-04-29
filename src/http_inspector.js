import * as http_orig from 'http'
import * as https_orig from 'https'
import { errorMonitor } from 'events'

const add_legacy_errorMonitor = (eventsEmmiter, cb) => {
	const original_emit = eventsEmmiter.emit
	eventsEmmiter.emit = function(event, ...args) {
		if( event === 'error' ) {
			cb(event, ...args)
			eventsEmmiter.emit = original_emit // TODO: can we be sure then at most one error emited for one `request`? or it's too early to cleanup?
		}
		return original_emit.call(eventsEmmiter, event, ...args)
	}
}

// TODO: надо и входящие запросы логировать

export class HttpInspector {
	constructor(callbacks) {
		this.inspect = false
		this.wrap_with_inspector(http_orig.default, callbacks)
		this.wrap_with_inspector(https_orig.default, callbacks)
	}
	wrap_with_inspector(http, callbacks) {
		const original_request_func = http.request
		const inspector = this // I preserve original `this` in overwritten `http.request`, so to get to `inspect` flag I need this line
		http.request = function(...args) {
			// url: URL | string | `options`
			// options: Object | undefined
			// callback: Function | undefined
			// DOCS: url can be a string or a URL object. If url is a string, it is automatically parsed with new URL().
			// If it is a URL object, it will be automatically converted to an ordinary options object.
			// If both url and options are specified, the objects are merged, with the options properties taking precedence.
			// The optional callback parameter will be added as a one-time listener for the 'response' event.
			// TODO: вероятно надо это реализовать самому

			const request = original_request_func.call(this, ...args)

			if( inspector.inspect === false ) return request

			// TODO: move before `original_request_func` for more precise mesurments (around 5ms-10ms)
			callbacks.on_start?.(request, ...args)

			if( callbacks.on_write ) {
				const original_write = request.write
				request.write = function(...args) {
					callbacks.on_write(request, ...args)
					return original_write.call(this, ...args)
				}
			}

			if( callbacks.on_end ) {
				const original_end = request.end
				request.end = function(...args) {
					callbacks.on_end(request, ...args)
					return original_end.call(this, ...args)
				}
			}

			if( callbacks.on_close ) {
				request.prependOnceListener('close', (...args) => {
					callbacks.on_close(request, ...args)
				})
			}

			if( callbacks.on_abort ) {
				request.prependOnceListener('abort', (...args) => {
					callbacks.on_abort(request, ...args)
				})
			}

			// TODO: don't understand this event. not even sure if it exists. saw it in another project
			if( callbacks.on_finish ) {
				request.prependOnceListener('finish', (...args) => {
					callbacks.on_finish(request, ...args)
				})
			}

			if( callbacks.on_timeout ) {
				request.prependOnceListener('timeout', (...args) => {
					callbacks.on_timeout(request, ...args)
				})
			}

			// TODO: > If this event is not being listened for ... clients ... will have their connections closed.
			if( callbacks.on_connect_req ) {
				request.prependOnceListener('connect', (...args) => {
					callbacks.on_connect_req(request, ...args)
				})
			}

			// TODO: > If this event is not being listened for ... clients ... will have their connections closed.
			if( callbacks.on_upgrade ) {
				request.prependOnceListener('upgrade', (...args) => {
					callbacks.on_upgrade(request, ...args)
				})
			}

			if( callbacks.on_error ) {
				// > If an EventEmitter does not have at least one listener registered for the 'error' event,
				// > and an 'error' event is emitted, the error is thrown, a stack trace is printed, and the Node.js process exits.
				// But because I need to set a listener this won't happen unless I use `errorMonitor`
				request.prependOnceListener(errorMonitor, (...args) => {
					callbacks.on_error(request, ...args)
				})
				// TODO: ... which was
				// > Added in: v13.6.0, v12.17.0
				// so for compatibility with earlier versions of Node.js I'd need to use another approach:
				// add_legacy_errorMonitor(request, callbacks.on_error)
			}

			// TODO: skip if no callbacks for "sub-events"
			request.prependOnceListener('response', (response, ...args) => {
				callbacks.on_response?.(request, response, ...args)

				if( callbacks.on_data ) {
					response.prependListener('data', (...args) => {
						callbacks.on_data(request, response, ...args)
					})
				}

				if( callbacks.on_abort_response ) {
					response.prependOnceListener('aborted', (...args) => {
						callbacks.on_abort_response(request, response, ...args)
					})
				}

				if( callbacks.on_close_response ) {
					response.prependOnceListener('close', (...args) => {
						callbacks.on_close_response(request, response, ...args)
					})
				}

				if( callbacks.on_end_response ) {
					response.prependOnceListener('end', (...args) => {
						callbacks.on_end_response(request, response, ...args)
					})
				}

				if( callbacks.on_error_response ) {
					// > If an EventEmitter does not have at least one listener registered for the 'error' event,
					// > and an 'error' event is emitted, the error is thrown, a stack trace is printed, and the Node.js process exits.
					// But because I need to set a listener this won't happen unless I use `errorMonitor`
					response.prependOnceListener(errorMonitor, (...args) => {
						callbacks.on_error_response(request, response, ...args)
					})
					// TODO: ... which was
					// > Added in: v13.6.0, v12.17.0
					// so for compatibility with earlier versions of Node.js I'd need to use another approach:
					// add_legacy_errorMonitor(response, callbacks.on_error_response)
				}
			})
	
			// TODO: skip if no callbacks for "sub-events"
			// TODO: check out the case of keep-alive & if the inspector was stopped for a while and missed the request creation
			request.prependOnceListener('socket', (socket, ...args) => {
				callbacks.on_socket?.(request, socket, ...args)

				// TODO: `prependListener` instead of `prependOnceListener` for `keep-alive` ???
				if( callbacks.on_lookup ) {
					socket.prependListener('lookup', (...args) => {
						callbacks.on_lookup(request, socket, ...args)
					})
				}

				if( callbacks.on_connect ) {
					socket.prependListener('connect', (...args) => {
						callbacks.on_connect(request, socket, ...args)
					})
				}

				if( callbacks.on_secureConnect ) {
					socket.prependListener('secureConnect', (...args) => {
						callbacks.on_secureConnect(request, socket, ...args)
					})
				}
			})

			return request
		}
	}
	start() { this.inspect = true }
	stop() { this.inspect = false }
}
