import { randomInRange } from './tools.js'

const mapObject = (obj, fn) => Object.fromEntries(Object.entries(obj).map(([key, val]) => [key, fn(val, key)]))

// some random contants to connect different nodes into a graph of a form that expected by DevTools
// not sure if all of them are needed. expecially `frameTreeNodeId`
const pid_main = 4575
const pid_secondary = 13557
const frame = "4D437AF9B2B977363FF6DA4BD7A07C80"
const frameTreeNodeId = 121

const add_request_nodes = (entry) => {
	const requestId = randomInRange(1_000,2_000)

	const request_nodes = []

	const ResourceWillSendRequest = {
		args: {
			data: {
				requestId
			}
		},
		cat: "devtools.timeline",
		name: "ResourceWillSendRequest",
		ph: "I",
		pid: pid_main,
		s: "p",
		tid: pid_main,
		ts: undefined,
	}

	const ResourceSendRequest = {
		args: {
			data: {
				frame,
				priority: "High",
				requestId,
				requestMethod: entry.request.method,
				url: entry.request.url
			}
		},
		cat: "devtools.timeline",
		name: "ResourceSendRequest",
		ph: "I",
		pid: pid_secondary,
		s: "t",
		tid: 1,
		ts: undefined,
	}

	const ResourceReceiveResponse = {
		args: {
			data: {
				encodedDataLength: -1,
				frame,
				fromCache: false,
				fromServiceWorker: false,
				mimeType: "text/html",
				requestId,
				// responseTime: Date.getTime() but float. Not really usefull, as it's an absolute time... which is actually good... but most other times are relative
				statusCode: entry.response.status,
				timing: {
					pushStart: 0, // TODO: no idea what is it
					pushEnd: 0, // TODO: no idea what is it
					dnsStart: -1, //0.316,
					dnsEnd: -1, //514.626,
					connectStart: -1, //514.626,
					sslStart: -1, //514.888,
					sslEnd: -1, //1250.053,
					connectEnd: -1, //1250.068,
					sendStart: undefined,
					sendEnd: -1, //1250.785,
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
	}

	const ResourceReceivedData = {
		args: {
			data: {
				encodedDataLength: entry.response.bodySize,
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
	}

	const ResourceFinish = {
		args: {
			data: {
				decodedBodyLength: entry.response.bodySize,
				didFail: false,
				encodedDataLength: entry.response.content.compression,
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
	}

	const startedDateTime = Math.round(entry._highResolutionTimestamp * 1000)
	const ts = mapObject(entry.timings, (val, key) => val === -1 ? 0 : val * 1000)
	ResourceWillSendRequest.ts = startedDateTime
	ResourceSendRequest.ts = startedDateTime + Math.round(ts.send) // point 1
	ResourceReceiveResponse.args.data.timing.sendStart = ts.send / 1000
	ResourceReceiveResponse.args.data.timing.receiveHeadersEnd = (ts.send + ts.wait) / 1000 // point 3
	ResourceReceiveResponse.args.data.timing.requestTime = (startedDateTime + ts.send) / 1000000, // point 2
	ResourceReceiveResponse.ts = startedDateTime + Math.round(ts.send + ts.wait)
	ResourceReceivedData.ts = startedDateTime + Math.round(ts.send + ts.wait + ts.receive) // mark
	ResourceFinish.args.data.finishTime = (startedDateTime + ts.send + ts.wait + ts.receive)/ 1000000 // point 4
	ResourceFinish.ts = startedDateTime + Math.round(entry.time * 1000), // point 5

	request_nodes.push(ResourceWillSendRequest)
	request_nodes.push(ResourceSendRequest)
	request_nodes.push(ResourceReceiveResponse)
	request_nodes.push(ResourceReceivedData)
	request_nodes.push(ResourceFinish)

	return request_nodes
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
