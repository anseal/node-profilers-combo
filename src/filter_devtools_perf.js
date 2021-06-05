import fs from 'fs'

let perf = JSON.parse(fs.readFileSync('../logs/upload.json'))

const node_names = new Set([
	'thread_name',
	'process_name',
	'TracingStartedInBrowser',
	'Profile',
	// 'ProfileChunk',

	'ResourceWillSendRequest',
	'ResourceSendRequest',
	'ResourceReceiveResponse',
	'ResourceReceivedData',
	'ResourceFinish',
])
perf = perf.filter(node => {
	if( ! node_names.has(node.name) ) return false
	if( node.name === 'thread_name' ) {
		if( node.args.name !== 'CrBrowserMain' ) return false
	}
	if( node.name === 'process_name' ) {
		if( node.args.name !== 'Browser' ) return false
	}
	return true
})

fs.writeFileSync('../logs/upload-filtered.json', JSON.stringify(perf, undefined, '\t'))