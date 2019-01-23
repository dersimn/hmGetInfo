const pkg = require('./package.json');
const deepExtend = require('deep-extend');
const xmlrpc = require('homematic-xmlrpc');
const util = require('util');
const log = require('yalm');
var jsonfile = require('jsonfile')
var file = './data.json'
const PQueue = require('p-queue');
const queue = new PQueue({concurrency: 1});

const config = require('yargs')
    .usage(pkg.name + ' ' + pkg.version + '\n' + pkg.description + '\n\nUsage: $0 [options]')
    .describe('verbosity', 'Possible values: "error", "warn", "info", "debug"')
    .describe('ccu-address', 'IP address of your CCU')
    .describe('ccu-port', 'Port of your CCU (use to switch between RFD and HmIP)')
    .describe('stdout', 'Output JSON to STDOUT instead of file').boolean('stdout')
    .alias({
        c: 'ccu-address',
        p: 'ccu-port',
        h: 'help',
        v: 'verbosity'
    })
    .default({
        'verbosity':'debug',
        'ccu-port': 2001
    })
    .demandOption([
        'ccu-address'
    ])
    .version()
    .help('help')
    .argv;

if (!config.stdout) {
    log.setLevel(config.verbosity);
} else {
    log.setLevel('eror');
}

var allDevices = new Object();

var clientOptions = {
    host: config.ccuAddress,
    port: config.ccuPort,
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

    operations.READ  = ( opObj & 1 ) ? true : false;
    operations.WRITE = ( opObj & 2 ) ? true : false;
    operations.EVENT = ( opObj & 4 ) ? true : false;

    return operations;
}

methodCall('listDevices', null).then((response) => {
    response.forEach( ( device ) => {
        if (/^BidCoS/.test(device.ADDRESS)) return; // Skip BidCoS devices

        allDevices[device.ADDRESS] = Object.assign({}, device);
        allDevices[device.ADDRESS]['FLAGS'] = transformFlags( allDevices[device.ADDRESS]['FLAGS'] );

        // Convert PARAMSETS from Array to Object
        allDevices[device.ADDRESS]['PARAMSETS'] = new Object();
        device.PARAMSETS.forEach( (paramset) => {
            allDevices[device.ADDRESS]['PARAMSETS'][paramset] = new Object();
        });

        // Iterate through all PARAMSETS
        device.PARAMSETS.forEach( (paramset) => {
            // Assign values of each paramset
            queue.add(() => methodCall('getParamset', [device.ADDRESS , paramset]).then((response) => {
                // Turn { FOO: 0.5, BAR: 1.0 } into { FOO: {VALUE: 0.5}, BAR: {VALUE: 1.0} }
                let tmp = new Object();
                for (var key in response) {
                    tmp[key] = { 'VALUE': response[key] };
                }
                deepExtend(allDevices[device.ADDRESS]['PARAMSETS'][paramset], tmp);
            }).catch((err) => {
                log.error('getParamset', device.ADDRESS, paramset, err.faultCode, err.faultString);
            }));

            queue.add(() => methodCall('getParamsetDescription', [device.ADDRESS , paramset]).then((response) => {
                deepExtend(allDevices[device.ADDRESS]['PARAMSETS'][paramset], response);

                // Transform to human readable format, see HM_XmlRpc_API.pdf, page 5
                for (let key in response) {
                    allDevices[device.ADDRESS]['PARAMSETS'][paramset][key]['OPERATIONS'] = transformOperations(response[key].OPERATIONS);
                }
                for (let key in response) {
                    allDevices[device.ADDRESS]['PARAMSETS'][paramset][key]['FLAGS'] = transformFlags(response[key].FLAGS);
                }
            }).catch((err) => {
                log.error('getParamsetDescription', device.ADDRESS, paramset, err.faultCode, err.faultString);
            }));
        });
    });

    queue.onEmpty().then(() => {
        log.debug('finished');
        if (config.stdout) {
            console.log(JSON.stringify(allDevices, null, 2));
        } else {
            jsonfile.writeFile(file, allDevices, {spaces: 2}, (err) => {
                if (err) log.error('jsonfile.writeFile', err);
            });
        }
        clearInterval(interval);
    });
}).catch((err) => {
    log.error('listDevices', err);
});

var interval = setInterval(()=>{
    log.debug('queue size', queue.size);
},1000);
