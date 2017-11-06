const deepExtend = require('deep-extend');
const xmlrpc = require('xmlrpc');
const util = require('util');
const log = require('yalm');
log.setLevel("debug");
var jsonfile = require('jsonfile')
var file = './data.json'
const PQueue = require('p-queue');
const queue = new PQueue({concurrency: 1});

var allDevices = new Object();

var clientOptions = {
	host: '10.30.21.31',
	port: 2001,
	path: '/'
}

var client = xmlrpc.createClient(clientOptions)

function methodCall(method, parameters) {
	return new Promise((resolve, reject) => {
		client.methodCall(method, parameters, (error, value) => {
			if ( error ) {
				reject(error);
			} else {
				resolve(value);
			}
		});
	});
}

function transformFlags(flagObj) {
	let flags = new Object();

	flags.VISIBLE   = ( flagObj & 0x01 ) ? true : false;
	flags.INTERNAL  = ( flagObj & 0x02 ) ? true : false;
	flags.TRANSFORM = ( flagObj & 0x04 ) ? true : false;
	flags.SERVICE   = ( flagObj & 0x08 ) ? true : false;
	flags.STICKY    = ( flagObj & 0x10 ) ? true : false;

	return flags;
}
function transformOperations(opObj) {
	let operations = new Object();

	operations.READ	 = ( opObj & 1 ) ? true : false;
	operations.WRITE = ( opObj & 2 ) ? true : false;
	operations.EVENT = ( opObj & 4 ) ? true : false;

	return operations;
}

methodCall("listDevices", null).then((response) => {
	response.forEach( ( device ) => {
		allDevices[ device.ADDRESS ] = Object.assign({}, device);
		allDevices[device.ADDRESS]["FLAGS"] = transformFlags( allDevices[device.ADDRESS]["FLAGS"] );

		// Convert PARAMSETS from Array to Object
		allDevices[device.ADDRESS]["PARAMSETS"] = new Object();
		device.PARAMSETS.forEach( (paramset) => {
			allDevices[device.ADDRESS]["PARAMSETS"][paramset] = new Object();
		});

		// Iterate through all PARAMSETS
		device.PARAMSETS.forEach( (paramset) => {
			// Assign values of each paramset
			queue.add(() => methodCall("getParamset", [device.ADDRESS , paramset]).then((response) => {
				// Turn { "SOMETHING": 0.5 } into { "SOMETHING": {"VALUE": 0.5} }
				let tmp = new Object();
				for (var key in response) {
					tmp[key] = { "VALUE": response[key] };
				}
				deepExtend(allDevices[device.ADDRESS]["PARAMSETS"][paramset], tmp);
			}, (error) => {
				log.error("getParamset", device.ADDRESS, paramset, "faultCode:"+error.faultCode);
			}));

			queue.add(() => methodCall("getParamsetDescription", [device.ADDRESS , paramset]).then((response) => {
				deepExtend(allDevices[device.ADDRESS]["PARAMSETS"][paramset], response);

				// Transform to human readable format, see HM_XmlRpc_API.pdf, page 5
				for (let key in response) {
					allDevices[device.ADDRESS]["PARAMSETS"][paramset][key]["OPERATIONS"] = transformOperations( response[key].OPERATIONS );
				}
				for (let key in response) {
					allDevices[device.ADDRESS]["PARAMSETS"][paramset][key]["FLAGS"] = transformFlags( response[key].FLAGS );
				}
			}, (error) => {
				log.error("getParamsetDescription", device.ADDRESS, paramset, "faultCode:"+error.faultCode);
			}));
		});
	});

	queue.onEmpty().then(() => {
		log.debug("finished");
		jsonfile.writeFile(file, allDevices, {spaces: 2}, function (err) {
			if ( err ) {
				log.error("jsonfile.writeFile", err);
			}
		});
		clearInterval(interval);
	});
}, (error) => {
	log.error("listDevices", error);
});

var interval = setInterval(()=>{
	log.debug("queue size", queue.size);
},500);
