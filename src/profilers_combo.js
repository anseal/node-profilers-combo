import util from 'util'
import fsp from 'fs/promises'
import inspector from 'inspector'
import { performance } from 'perf_hooks'
import { HarLogger } from './har_logger.js'
import { merge_cpuprofile_and_har } from './merge_cpuprofile_and_har.js'

export class ProfilersCombo {
	constructor() {
		this.har_logger = new HarLogger()
		this.inspector = new inspector.Session()
		this.post = util.promisify(this.inspector.post.bind(this.inspector))
	}
	async seconds(delay, path) {
		await this.start()
		await new Promise(resolve => setTimeout(resolve, delay * 1000))
		return await this.stop(path)
	}
	async start() {
		this.profiling_started = performance.now() // TODO: should it be here or after `post`s... which one?

		this.inspector.connect()
		await this.post('Profiler.enable')
		await this.post('Profiler.start')
			// TODO: will ot throw if profiler is already ON

		this.har_logger.start()
	}
	async stop(path) {
		try {
			const { profile } = await this.post('Profiler.stop')
			const har = this.har_logger.stop()
			if( typeof path !== 'string' ) {
				throw new Error('expected `path` to save logs')
			}
			// timestamps of `inspector` and `performance.now()` have different starting value
			// TODO: try `hrtimer`
			profile.startTime = Math.round(this.profiling_started * 1000)
			profile.endTime = Math.round(performance.now() * 1000)
			const perf = merge_cpuprofile_and_har("script_url", profile, har)
			await fsp.writeFile(path + '.cpuprofile', JSON.stringify(profile, undefined, '\t'))
			await fsp.writeFile(path + '.har'       , JSON.stringify(har    , undefined, '\t'))
			await fsp.writeFile(path + '.json'      , JSON.stringify(perf   , undefined, '\t'))
			return { profile, har, perf }
		} catch(e) {
			console.log(e)
			// TODO: ???
		}
	}
	// TODO: ?
	// async heap_snapshot() {
	// 	this.inspector.on('HeapProfiler.addHeapSnapshotChunk', (m) => {
	// 		fs.writeSync(fd, m.params.chunk);
	// 	})
	// 	await this.inspector.post('HeapProfiler.takeHeapSnapshot', ??? null, (err, r) => {
	// 		this.inspector.disconnect()
	// 	})
	// }
}
