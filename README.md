# node-profilers-combo
Writes `.har` &amp; `.cpuprofile` and combines them into a `.json` file suitable for *Performance* tab of *Chrome DevTools*

# Usage
```js
import { ProfilersCombo } from 'node-profilers-combo'

const combo = new ProfilersCombo()

...

await combo.start()

... // some code to profile

const { cpuprofile, har, perf } = await combo.stop(`path/filename`)
// 3 files will be created 'filename.cpuprofile', 'filename.har', 'filename.json'
// No need to `await` for `stop()` if you don't care about returned results
// (And at the moment you probably shouldn't, because the returned `cpuprofile` is mutated a little bit, will fix later)
```
