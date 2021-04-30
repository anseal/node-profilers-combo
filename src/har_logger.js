import { performance } from 'perf_hooks'
import { HttpInspector } from './http_inspector.js'
import { randomInRange } from './tools.js'

const mapHeaders = (headers) => Object.entries(headers).map(([name, value]) => ({ name, value }))

function get_callFrames(exclude) {
	return new Error("").stack
		.split('\n')
		.slice(1 + exclude) // +1 to remove exception "header" - the 'Error: ...'
		.map(frame => {
			let matches = frame.match(/    at (.*?) \((.*):(.*?):(.*?)\)/)
			if( matches === null ) matches = frame.match(/    at ()(.*):(.*?):(.*)/) // for global context?
			if( matches === null ) matches = frame.match(/    at ()(.*)()()/) // for internals?
			const [_, functionName, url, lineNumber, columnNumber] = matches
			// const [_, functionName, url, lineNumber, columnNumber] = frame.match(/    at (.*?)? \((.*):(.*?):(.*?)\)/)
			return {
				functionName,
				// scriptId: "8", // have no idea how to figure this one out
				url,
				lineNumber: Number(lineNumber),
				columnNumber: Number(columnNumber)
			}
		})
}

function new_entry() {
	return {
		_initiator: {
			type: "script",
			stack: {
				callFrames: undefined,
			}
		},
		// _priority: "High",
		// _resourceType: "fetch",

		// pageref: "page_0",
		startedDateTime: undefined, // e.g "2009-04-16T12:07:23.596Z", // YYYY-MM-DDThh:mm:ss.sTZD
		_highResolutionTimestamp: undefined,
		time: undefined, // milliseconds = sum of this.timings (excluding -1 values... but watch out for ssl & connect fields)
		request: {
			method: undefined, // "GET" / "POST" / etc.
			url: undefined, // e.g "http://www.example.com/path/?param=value"
			httpVersion: undefined, // "HTTP/1.1", // "http/2.0"
			cookies: [
				// {
				// 	name: "TestCookie",
				// 	value: "Cookie Value",
				// 	// path: "/",
				// 	// domain: "www.janodvarko.cz",
				// 	// expires: "2009-07-24T19:20:30.123+02:00", // YYYY-MM-DDThh:mm:ss.sTZD
				// 	// httpOnly: false,
				// 	// secure: false, // true if was transmitted over ssl,
				// 	// comment: "",
				// }
			],
			headers: [
				// {
				// 	name: "Accept-Encoding",
				// 	value: "gzip,deflate",
				// 	// comment: "",
				// },
			],
			queryString : [ // list of all parameters & values parsed from a query string
				// {
				// 	name: "param",
				// 	value: "value",
				// 	// comment: "",
				// },
			],
			// postData : {
			// 	mimeType: "multipart/form-data",
			// 	params: [
			// 		{
			// 			name: "paramName",
			// 			// value: "paramValue", // value of a posted parameter or content of a posted file.
			// 			// fileName: "example.pdf",
			// 			// contentType: "application/pdf", // content type of a posted file.
			// 			// comment: "",
			// 		},
			// 	], // in case of URL encoded parameters
			// 	text: "plain text posted data", // `text` and `params` are mutually exclusive
			// 	// comment: "",
			// },
			headersSize : -1, // bytes until (and including) the double CRLF before the body | -1
			bodySize : -1, // bytes | -1
			// comment : "",
			_errorFull: undefined, // mine prop
		},
		response: {
			status: 0, // e.g 200, // 0 used in DevTools for timeout's etc
			statusText: "", // "" used in DevTools for timeout's etc
			httpVersion: "", // "" used in DevTools for timeout's etc
			cookies: [
				// same format as in request.cookies
			],
			headers: [
				// same format as in request.cookies
			],
			content: {
				// 0 used in DevTools for timeout's etc
				size: -1, // Should be equal to `response.bodySize` if there is no compression and bigger when the content has been compressed.
				// compression: 0, // Number of bytes saved
				mimeType: 'x-unknown', // 'x-unknown' used in DevTools for timeout's etc
					// value of the `Content-Type` response header
					// The charset attribute of the MIME type is included (if available).
				// text: "PGh0bWw+PGhlYWQ+PC9oZWFkPjxib2R5Lz48L2h0bWw+XG4=",
					// Response body sent from the server or loaded from the browser cache.
					// This field is populated with textual content only. The text field is either HTTP decoded text
					// or a encoded (e.g. "base64") representation of the response body
				// encoding: "base64",
					// Encoding used for response text field e.g "base64".
					// Leave out this field if the text field is HTTP decoded (decompressed & unchunked),
					// than trans-coded from its original character set into UTF-8
					// Before setting the text field, the HTTP response is decoded (decompressed & unchunked),
					// than trans-coded from its original character set into UTF-8. Additionally, it can be encoded
					// using e.g. base64. Ideally, the application should be able to unencode a base64 blob and get
					// a byte-for-byte identical resource to what the browser operated on.
					// Encoding field is useful for including binary responses (e.g. images) into the HAR file.
				// comment: "",
			},
			redirectURL: "",
			headersSize : -1,
				// bytes until (and including) the double CRLF before the body | -1
				// Additional headers appended by the browser are not included in this number,
				// but they appear in the list of header objects
			bodySize : -1, // bytes | -1 | Set to zero in case of responses coming from the cache (304)
			// comment : "",

			// _transferSize: 0,
			_error: undefined, // prop from DevTools
			_errorFull: undefined, // mine prop
		},
		cache: {
			// beforeRequest: { // optional if info is unavailable | null if not in cache | { ... }
			// 	// expires: "2009-04-16T15:50:36",
			// 	lastAccess: "2009-16-02T15:50:34",
			// 	eTag: "",
			// 	hitCount: 0,
			// 	// comment: "",
			// },
			// afterRequest: {
			// 	// same format as `beforeRequest`
			// },
			// comment: "",
		},
		timings: { // milliseconds
			blocked: -1, // Time spent in a queue waiting for a network connection
			dns: -1,
			ssl: -1, // If this field is defined then the time is also included in the `connect` field
			connect: -1, // connect would be -1 for requests which re-use an existing connection.
			send: undefined,
			wait: undefined,
			receive: undefined,
			// comment: "",

			// _blocked_queueing: -1
		},
		_raw_timings: {
			on_start: undefined,
			on_write: undefined, // TODO: remove?
			on_end: undefined,
			on_close: undefined,
			on_abort: undefined,
			on_finish: undefined,
			on_timeout: undefined,
			on_connect_req: undefined,
			on_upgrade: undefined,
			on_error: undefined,
			on_response: undefined,
			on_data: undefined, // TODO: remove?
			on_abort_response: undefined,
			on_close_response: undefined,
			on_end_response: undefined,
			on_error_response: undefined,
			on_socket: undefined,
			on_lookup: undefined,
			on_connect: undefined,
			on_secureConnect: undefined,
		},
		serverIPAddress: undefined,
		// connection: "id", // Unique ID of the parent TCP/IP connection
		// comment: "",
	}
}

const node_version = process.versions.node

const do_log = false
const log = (...args) => {
	if( do_log ) console.log(...args)
}

export class HarLogger {
	constructor() {
		this.map_request_to_entries = new WeakMap()
		this.http_inspector = new HttpInspector({
			on_start: (request, url) => {
				if( do_log ) request.__id = randomInRange(10,20)
				log("on_start", request.__id)

				const entry = new_entry()
				entry.request.url = `${request.protocol}//${request.host}${request.path}` // url.href
				entry.request.method = request.method
				entry._raw_timings.on_start =
				entry._highResolutionTimestamp = performance.now()
				entry.startedDateTime = new Date().toISOString()

				// useless in Chrome (Version 90.0.4430.72 (Official Build) (64-bit))
				// for imported har-s Chrome doesn't show anything on `initiator` tab
				// even for those har-s that were exported from Chrome itself
				// it'd be nice to add async traces here... but because of the above it not really usefull to me personally
				entry._initiator.stack.callFrames = get_callFrames(3)
					// 1 to remove `get_callFrames` itself, 2 to remove `on_start', 3 to remove `HttpInspector`

				this.har.log.entries.push(entry)
				this.map_request_to_entries.set(request, entry)
			},
			on_write: (request, ...args) => {
				log("on_write", request.__id, ...args)
				entry._raw_timings.on_write = performance.now()
			},
			on_end: (request, ...args) => {
				log("on_end", request.__id, ...args)
				const entry = this.map_request_to_entries.get(request)
				entry._raw_timings.on_end = performance.now()
			},
			on_close: (request, ...args) => {
				log("on_close", request.__id, ...args)
				const entry = this.map_request_to_entries.get(request)
				entry._raw_timings.on_close = performance.now()
			},
			on_abort: (request, ...args) => {
				log("on_abort", request.__id, ...args)
				const entry = this.map_request_to_entries.get(request)
				entry._raw_timings.on_abort = performance.now()
			},
			on_finish: (request, ...args) => {
				log("on_finish", request.__id, ...args)
				const entry = this.map_request_to_entries.get(request)
				entry._raw_timings.on_finish = performance.now()
				entry.request.headers = mapHeaders(request.getHeaders(), (value, key) => ({ name: key, value }))
			},
			on_timeout: (request, ...args) => {
				log("on_timeout", request.__id, ...args)
				const entry = this.map_request_to_entries.get(request)
				entry._raw_timings.on_timeout = performance.now()
			},
			// TODO: оно мне надо? что это вообще?
			on_connect_req: (request, ...args) => {
				log("on_connect_req", request.__id, ...args)
				const entry = this.map_request_to_entries.get(request)
				entry._raw_timings.on_connect_req = performance.now()
			},
			// TODO: оно мне надо? что это вообще?
			on_upgrade: (request, ...args) => {
				log("on_upgrade", request.__id, ...args)
				const entry = this.map_request_to_entries.get(request)
				entry._raw_timings.on_upgrade = performance.now()
			},
			on_error: (request, error, ...args) => {
				log("on_error", request.__id, ...args)
				const entry = this.map_request_to_entries.get(request)
				entry._raw_timings.on_error = performance.now()
				entry.request._errorFull = error.message
				// TODO: DevTools error codes
				// net::ERR_FAILED
				// net::ERR_CONNECTION_TIMED_OUT
				// net::???
				entry.request._error = 'net::' + error.code
			},
			on_response: (request, response, ...args) => {
				log("on_response", request.__id, ...args)
				const entry = this.map_request_to_entries.get(request)
				entry._raw_timings.on_response = performance.now()
				entry.response.status = response.statusCode
				entry.response.statusText = response.statusMessage
				entry.response.httpVersion = 'HTTP/' + response.httpVersion
				entry.response.headers = mapHeaders(response.headers, (value, key) => ({ name: key, value }))
				if( response.headers['content-length'] ) entry.response.content.size = Number(response.headers['content-length'])
				entry.response.content.mimeType = response.headers['content-type']
				// TODO: entry.response.cookies = response.headers['set-cookie'].map(parseCookie)
				// TODO: entry.response.content.compression = 
			},
			on_data: (request, response, data, ...args) => {
				log("on_data", request.__id, ...args)
				const entry = this.map_request_to_entries.get(request)
				entry._raw_timings.on_data = performance.now()
				// TODO: not exactly, and maybe need to switch bodySize & content.size
				if( entry.response.bodySize === -1 ) {
					entry.response.bodySize = 0
					// entry.response.content.size = 0
				}
				entry.response.bodySize += data.length
				// entry.response.content.size += data.length
			},
			on_abort_response: (request, response, ...args) => {
				log("on_abort_response", request.__id, ...args)
				const entry = this.map_request_to_entries.get(request)
				entry._raw_timings.on_abort_response = performance.now()
			},
			on_close_response: (request, response, ...args) => {
				log("on_close_response", request.__id, ...args)
				const entry = this.map_request_to_entries.get(request)
				entry._raw_timings.on_close_response = performance.now()
			},
			on_end_response: (request, response, ...args) => {
				log("on_end_response", request.__id, ...args)
				const entry = this.map_request_to_entries.get(request)
				entry._raw_timings.on_end_response = performance.now()
			},
			on_error_response: (request, response, ...args) => {
				log("on_error_response", request.__id, ...args)
				const entry = this.map_request_to_entries.get(request)
				entry._raw_timings.on_error_response = performance.now()
			},
			on_socket: (request, socket, ...args) => {
				// socket.encrypted: true // secureConnecting:true
				log("on_socket", request.__id, ...args)
				const entry = this.map_request_to_entries.get(request)
				entry._raw_timings.on_socket = performance.now()
			},
			on_lookup: (request, socket, error, address, ...args) => {
				// TODO: if( error )
				log("on_lookup", request.__id, ...args)
				const entry = this.map_request_to_entries.get(request)
				entry._raw_timings.on_lookup = performance.now()
				entry.serverIPAddress = address
			},
			on_connect: (request, socket, ...args) => {
				log("on_connect", request.__id, ...args)
				const entry = this.map_request_to_entries.get(request)
				entry._raw_timings.on_connect = performance.now()
			},
			on_secureConnect: (request, socket, ...args) => {
				log("on_secureConnect", request.__id, ...args)
				const entry = this.map_request_to_entries.get(request)
				entry._raw_timings.on_secureConnect = performance.now()
			},
		})
	}
	start() {
		if( this.inspect ) throw new Error("HAR Logger already in progress") // TODO: `return`?
		this.inspect = true

		this.har = {
			// http://www.softwareishard.com/blog/har-12-spec/
			// Custom fields and elements MUST start with an underscore
			log: {
				version: "1.2",
				creator: {
					name: "node_har_logger",
					version: "1", // TODO: get own version
					// comment: "",
				},
				browser: {
					name: "Node.js",
					version: node_version,
					// comment: "",
				},
				pages: [
					// {
					// 	startedDateTime: "2009-04-16T12:07:23.596Z", // YYYY-MM-DDThh:mm:ss.sTZD
					// 	id: "page_0",
					// 	title: "title",
					// 	pageTimings: { // milliseconds from startedDateTime | -1
					// 		onContentLoad: 1234,
					// 		onLoad: 1234,
					// 		// comment: "",
					// 	},
					// 	// comment: "",
					// },
				],
				entries: [
					// see new_entry
				],
				// comment: "",
			}
		}
		this.http_inspector.start()
	}
	stop() {
		if( this.inspect === false ) throw new Error("HAR Logger already stopped") // TODO: `return`?
		this.inspect = false

		this.http_inspector.stop()
		const har = this.har
		this.har = undefined

		har.log.entries.forEach(entry => {
			const ts = entry._raw_timings
			entry.timings.blocked = ts.on_socket - ts.on_start // Time spent in a queue waiting for a network connection
			entry.timings.dns = ts.on_lookup - ts.on_socket
			if( ts.on_error ) { // dns error // TODO: other errors
				// TODO:
				//	```
				// 	entry.timings.connect = -1
				// 	entry.time = ts.on_lookup - ts.on_start
				//	```
				// time until `on_error` probably doesn't matter - it's just some JS delays, but
				// `entry.timings.connect !== -1` shows up in the DevTools and confuses
				// I can just set `connect = -1`, but the `entry.time` won't be a sum of all timings, 
				// which breaks har spec, but DevTools do not care, so maybe it's OK
				entry.timings.ssl = -1
				entry.timings.connect = ts.on_error - ts.on_lookup
				entry.timings.send = -1
				entry.timings.wait = -1
				entry.timings.receive = -1
				entry.time = ts.on_error - ts.on_start
			} else if( ts.on_secureConnect ) {
				entry.timings.ssl = ts.on_secureConnect - ts.on_connect // If this field is defined then the time is also included in the `connect` field
				entry.timings.connect = ts.on_secureConnect - ts.on_lookup // connect would be -1 for requests which re-use an existing connection.
				entry.timings.send = ts.on_finish - ts.on_secureConnect
				entry.timings.wait = ts.on_response - ts.on_finish
				entry.timings.receive = ts.on_end_response - ts.on_response
				entry.time = ts.on_end_response - ts.on_start
			} else {
				entry.timings.connect = ts.on_connect - ts.on_lookup
				entry.timings.send = ts.on_finish - ts.on_connect
				entry.timings.wait = ts.on_response - ts.on_finish
				entry.timings.receive = ts.on_end_response - ts.on_response
				entry.time = ts.on_end_response - ts.on_start
			}
		})

		return har
	}
}
