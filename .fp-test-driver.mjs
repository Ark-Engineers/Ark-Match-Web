import { requestShumeiDeviceId } from './.fp-test-bundle.mjs'
const did = await requestShumeiDeviceId('http://localhost:5175/thirdparty/fp')
console.log('DID_OK', did)
