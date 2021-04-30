import { randomInRange } from './tools.js'

const mapObject = (obj, fn) => Object.fromEntries(Object.entries(obj).map(([key, val]) => [key, fn(val, key)]))

// some random contants to connect different nodes into a graph of a form that expected by DevTools
// not sure if all of them are needed. expecially `frameTreeNodeId`
const pid_main = 4575
const pid_secondary = 13557
const frame = "4D437AF9B2B977363FF6DA4BD7A07C80"
const frameTreeNodeId = 121

// Looks like this node is used only when resources are loaded by the browser
// const node_will_send = (requestId) => ({
// 	args: {
// 		data: {
// 			requestId
// 		}
// 	},
// 	cat: "devtools.timeline",
// 	name: "ResourceWillSendRequest",
// 	ph: "I",
// 	pid: pid_main,
// 	s: "p",
// 	tid: pid_main,
// 	ts: undefined,
// })

const node_send = (requestId, requestMethod, url) => ({
	args: {
		data: {
			frame,
			priority: "High",
			requestId,
			requestMethod,
			url,
		}
	},
	cat: "devtools.timeline",
	name: "ResourceSendRequest",
	ph: "I",
	pid: pid_secondary,
	s: "t",
	tid: 1,
	ts: undefined,
})

const node_response = (requestId, mimeType, statusCode) => ({
	args: {
		data: {
			encodedDataLength: -1,
			frame,
			fromCache: false,
			fromServiceWorker: false,
			mimeType,
			requestId,
			// responseTime: Date.getTime() but float. Not really usefull, as it's an absolute time... which is actually good... but most other times are relative
			statusCode,
			timing: {
				pushStart: 0, // TODO: no idea what is it
				pushEnd: 0, // TODO: no idea what is it
				dnsStart: -1,
				dnsEnd: -1,
				connectStart: -1,
				sslStart: -1,
				sslEnd: -1,
				connectEnd: -1,
				sendStart: undefined,
				sendEnd: -1,
				receiveHeadersEnd: undefined,
				requestTime: undefined,

				proxyEnd: -1,
				proxyStart: -1,
				workerReady: -1,
				workerStart: -1,
			}
		}
	},
	cat: "devtools.timeline",
	name: "ResourceReceiveResponse",
	ph: "I",
	pid: pid_secondary,
	s: "t",
	tid: 1,
	ts: undefined,
})

const node_data = (requestId, encodedDataLength) => ({
	args: {
		data: {
			encodedDataLength,
			frame,
			requestId,
		}
	},
	cat: "devtools.timeline",
	name: "ResourceReceivedData",
	ph: "I",
	pid: pid_secondary,
	s: "t",
	tid: 1,
	ts: undefined,
})

const node_finish = (requestId, decodedBodyLength, encodedDataLength) => ({
	args: {
		data: {
			decodedBodyLength,
			didFail: false,
			encodedDataLength,
			requestId,
			finishTime: undefined,
		}
	},
	cat: "devtools.timeline",
	name: "ResourceFinish",
	ph: "I",
	pid: pid_secondary,
	s: "t",
	tid: 1,
	ts: undefined,
})

const add_request_nodes = (entry) => {
	const requestId = randomInRange(1_000,2_000)

	const ResourceSendRequest = node_send(requestId, entry.request.method, entry.request.url)
	const ResourceReceiveResponse = node_response(requestId, entry.response.content.mimeType, entry.response.status)
	const ResourceReceivedData = node_data(requestId, entry.response.bodySize)
	// TODO: not sure that `encodedDataLength === entry.response.content.compression`
	// ... probably not, because HAR specs says: 'compression - number of **saved** bytes'
	const ResourceFinish = node_finish(requestId, entry.response.bodySize, entry.response.content.compression)

	const startedDateTime = entry._highResolutionTimestamp * 1000
	// const startedDateTime = Math.round(entry._highResolutionTimestamp * 1000)
	const ts = mapObject(entry.timings, (val, key) => val === -1 ? 0 : val * 1000)
	const timings = ResourceReceiveResponse.args.data.timing

	// absolute times in nanoseconds
	const created = startedDateTime
	const started = created + ts.blocked
	const dns_resolved = started + ts.dns
	const connected = dns_resolved + ts.connect - ts.ssl
	const connected_with_ssl = connected + ts.ssl
	const sent = connected_with_ssl + ts.send
	const first_byte = sent + ts.wait
	const loaded = first_byte + ts.receive
	const closed = loaded + (entry._raw_timings?.on_close||0)

	const mysterious_delta = 0

	// point 1
	ResourceSendRequest.ts = startedDateTime // mark 'Send Request'
	// TODO: do we need this?
	// ResourceReceiveResponse.args.data.timing.sendStart = ts.blocked / 1000

	// nanoseconds relative to req start
	// TODO: don't know if these are shown in thte GUI, and thus have no idea it this part of code is correct
	// timings.dnsStart = entry._raw_timings.on_socket - entry._raw_timings.on_start // TODO: on_end - on_start ?
	// timings.dnsEnd = entry._raw_timings.on_lookup - entry._raw_timings.on_start
	timings.connectStart = entry._raw_timings.on_lookup - entry._raw_timings.on_start // almost indistinguashable from `dnsEnd`
	if( entry._raw_timings.on_secureConnect ) {
		// timings.sslStart = entry._raw_timings.on_connect - entry._raw_timings.on_start
		// timings.sslEnd = entry._raw_timings.on_secureConnect - entry._raw_timings.on_start
		timings.connectEnd = entry._raw_timings.on_secureConnect - entry._raw_timings.on_start // almost indistinguashable from `sslEnd`
		timings.sendStart = entry._raw_timings.on_secureConnect - entry._raw_timings.on_start // almost indistinguashable from `connectEnd`
	} else {
		timings.connectEnd = entry._raw_timings.on_connect - entry._raw_timings.on_start
		timings.sendStart = entry._raw_timings.on_connect - entry._raw_timings.on_start // almost indistinguashable from `connectEnd`
	}
	timings.sendEnd = entry._raw_timings.on_finish - entry._raw_timings.on_start
	// TODO: looks like `on_responce` fires after headers've been recieved. is it really so?
	// timings.receiveHeadersEnd = entry._raw_timings.on_responce - entry._raw_timings.on_start

	// point 2 // TODO: mark 'requestStart'
	// but not this one. this is absolute time in seconds and...
	// ...its crazy! can't say it's a bug, because, well, it works... somehow. but:
	// 1) if I set it to `startedDateTime` - it'll point to the `connected_with_ssl` time (can think of it as `first byte sent`)
	//    This is kind of obvious after I figured it out, but not really and...
	// 2) DevTools adds there something else (so far I've seen small values around 1 ms) and I can't figure out where this `mysterious_delta`
	//    comes from. My best guess whould be that it's a `ts.blocked` time, but when DevTools records
	//    `ResourceReceiveResponse.args.data.timing.dnsStart` (which happens not so often) it doesn't adds up to the `requestTime`
	timings.requestTime = (startedDateTime + mysterious_delta) / 1000000
		// < ResourceReceiveResponse.ts

	// point 3
	// relative nanoseconds
	// And here aformentioned `mysterious_delta` should be substructed for some reason
	timings.receiveHeadersEnd = (first_byte - created - mysterious_delta) / 1000

	// mark 'Recieve Response'
	ResourceReceiveResponse.ts = first_byte
	// ResourceReceiveResponse.ts = Math.round(first_byte)
		// < finishTime

	// point 4
	// absolute seconds
	ResourceFinish.args.data.finishTime = loaded / 1000000
		// < ResourceFinish.ts

	// point 5, mark 'Finish Loading'
	// absolute milliseconds
	ResourceFinish.ts = closed
	// ResourceFinish.ts = Math.round(closed)

	// TODO: looks like there can be several 'Recieve Data' marks - `on_data` array?
	// strangely enougth 'Recieve Data' marks can appear after 'point 4'
	// ResourceReceivedData.ts = startedDateTime + Math.round(ts.send + ts.wait + ts.receive)

	const extra_nodes = (type, t1, t2) => {
		if( t1 === t2 ) return []

		const requestId = randomInRange(1_000,2_000)
		const send = node_send(requestId, 'GET', type + ":" + entry.request.url)
		send.ts = t1
		// send.ts = Math.round(t1)
		const finish = node_finish(requestId, 1, 1)
		finish.ts = t2
		// finish.ts = Math.round(t2)
		return [
			send,
			// node_response(requestId, 'text/html', 200),
			// node_data(requestId, 1),
			finish,
		]
	}

	let time = created
	return [
		ResourceSendRequest,
		ResourceReceiveResponse,
		// ResourceReceivedData,
		ResourceFinish,
		...extra_nodes("QUEUED",  time, time += ts.blocked),
		...extra_nodes("DNS",     time, time += ts.dns),
		...extra_nodes("CONNECT", time, time += (ts.connect - ts.ssl)),
		...extra_nodes("SSL",     time, time += ts.ssl),
		...extra_nodes("SEND",    time, time += ts.send),
		...extra_nodes("WAIT",    time, time += ts.wait),
		...extra_nodes("LOAD",    time, time += ts.receive),
		...extra_nodes("CLOSE",   time, closed),
	]
}

export const merge_cpuprofile_and_har = (script_url, cpuprofile, har) => {

	cpuprofile.nodes.forEach(parent_node => {
		parent_node.children?.forEach(child => {
			const child_node = cpuprofile.nodes.find(n => n.id === child)
			child_node.parent = parent_node.id // TODO: can there be more that one parent?
		})
		parent_node.callFrame.scriptId = Number(parent_node.callFrame.scriptId)
		if( ! parent_node.callFrame.url ) delete parent_node.callFrame.url
		if( parent_node.callFrame.lineNumber === -1 ) delete parent_node.callFrame.lineNumber
		if( parent_node.callFrame.columnNumber === -1 ) delete parent_node.callFrame.columnNumber
		delete parent_node.hitCount
		delete parent_node.children
		delete parent_node.positionTicks
	})

	return [
		// some mandatory metadata that works... somehow.
		// but some properties may be optional, and maybe even some nodes
		// `undefined` means that these will be set later
		{
			args: {
				name: "CrBrowserMain"
			},
			cat: "__metadata",
			name: "thread_name",
			ph: "M",
			pid: pid_main,
			tid: pid_main,
			ts: 0,
		},
		{
			args: {
				name: "Browser"
			},
			cat: "__metadata",
			name: "process_name",
			ph: "M",
			pid: pid_main,
			tid: 0,
			ts: 0,
		},
		{
			args: {
				data: {
					frameTreeNodeId,
					frames: [
						{
							frame,
							name: "",
							processId: pid_secondary,
							url: script_url,
						}
					],
					persistentIds: true
				}
			},
			cat: "disabled-by-default-devtools.timeline",
			name: "TracingStartedInBrowser",
			ph: "I",
			pid: pid_main,
			s: "t",
			tid: pid_main,
			ts: cpuprofile.startTime,
		},
		// cpuprofile
		{
			args: {
				data: {
					startTime: cpuprofile.startTime, // TODO: not sure if it's needed
				}
			},
			cat: "disabled-by-default-v8.cpu_profiler",
			id: "0x2",
			name: "Profile",
			ph: "P",
			pid: pid_secondary,
			tid: 1,
			ts: cpuprofile.startTime,
		},
		{
			args: {
				data: {
					cpuProfile: {
						nodes: cpuprofile.nodes,
						samples: cpuprofile.samples,
					},
					timeDeltas: cpuprofile.timeDeltas,
				}
			},
			cat: "disabled-by-default-v8.cpu_profiler",
			id: "0x2",
			name: "ProfileChunk",
			ph: "P",
			pid: pid_secondary,
			tid: 20,
			ts: cpuprofile.endTime
		},
		// network requests placed at the end of the `output`
		...har.log.entries.map(add_request_nodes).flat()
	]
}
