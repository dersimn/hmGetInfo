const pkg = require('./package.json');

const deepExtend = require('deep-extend');
const xmlrpc = require('homematic-xmlrpc');
const jsonfile = require('jsonfile');

const config = require('yargs')
    .usage(pkg.name + ' ' + pkg.version + '\n' + pkg.description + '\n\nUsage: $0 [options]')
    .describe('verbosity', 'Possible values: "error", "warn", "info", "debug"')
    .describe('ccu-address', 'IP address of your CCU')
    .describe('ccu-port', 'Port of your CCU (use to switch between RFD and HmIP)')
    .alias({
        c: 'ccu-address',
        p: 'ccu-port',
        h: 'help',
        v: 'verbosity'
    })
    .default({
        'verbosity':'debug',
        'ccu-port': 2001,
        'outputDestination': './output/data.json'
    })
    .demandOption([
        'ccu-address'
    ])
    .version()
    .help('help')
    .argv;

const PQueue = require('p-queue');
const queue = new PQueue({
    concurrency: 1,
    autoStart: false,
    interval: 500,
    intervalCap: 1
});

const cliProgress = require('cli-progress');
const progressbar = new cliProgress.Bar({
    format: 'Collecting paramsets [{bar}] {percentage}% | ETA: {eta}s | {value}/{total}',
    etaBuffer: 20,
    fps: 5
});

const log = require('yalm');
log.setLevel(config.verbosity);

const allDevices = {};

const client = xmlrpc.createClient({
    host: config.ccuAddress,
    port: config.ccuPort,
    path: '/'
});

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

function procAddress(address) {
    if (/:[0-9]+$/.test(address)) {
        let match = /([A-Za-z0-9\-]+):([0-9]+)/.exec(address);
        return [match[1], match[2]];
    } else {
        return [address, '_root'];
    }
}

methodCall('listDevices', null).then((response) => {
    response.forEach( ( device ) => {
        if (/^BidCoS/.test(device.ADDRESS)) return; // Skip BidCoS devices

        let [serial, channel] = procAddress(device.ADDRESS);

        allDevices[serial] = Object.assign({}, allDevices[serial]); // Initialize object if not exists yet
        allDevices[serial][channel] = Object.assign({}, device);    // Initialize object if not exists yet
        allDevices[serial][channel]['FLAGS'] = transformFlags( allDevices[serial][channel]['FLAGS'] );

        // Convert PARAMSETS from Array to Object
        allDevices[serial][channel]['PARAMSETS'] = new Object();
        device.PARAMSETS.forEach( (paramset) => {
            allDevices[serial][channel]['PARAMSETS'][paramset] = new Object();
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
                deepExtend(allDevices[serial][channel]['PARAMSETS'][paramset], tmp);
            }).catch((err) => {
                log.error('getParamset', device.ADDRESS, paramset, err.faultCode, err.faultString);
            }));

            queue.add(() => methodCall('getParamsetDescription', [device.ADDRESS , paramset]).then((response) => {
                deepExtend(allDevices[serial][channel]['PARAMSETS'][paramset], response);

                // Transform to human readable format, see HM_XmlRpc_API.pdf, page 5
                for (let key in response) {
                    allDevices[serial][channel]['PARAMSETS'][paramset][key]['OPERATIONS'] = transformOperations(response[key].OPERATIONS);
                }
                for (let key in response) {
                    allDevices[serial][channel]['PARAMSETS'][paramset][key]['FLAGS'] = transformFlags(response[key].FLAGS);
                }
            }).catch((err) => {
                log.error('getParamsetDescription', device.ADDRESS, paramset, err.faultCode, err.faultString);
            }));
        });
    });

    queue.onIdle().then(() => {
        log.debug('finished');
        clearInterval(interval);

        jsonfile.writeFile(config.outputDestination, allDevices, {spaces: 2}, (err) => {
            if (err) log.error('jsonfile.writeFile', err);
        });

        progressbar.stop();
    }).catch((err) => {
        log.error('queue error', err);
    });
    queue.start();

    var max_queuesize = queue.size;
    progressbar.start(max_queuesize, 0);

    var interval = setInterval(()=>{
        progressbar.update(max_queuesize-queue.size);
    },100);
}).catch((err) => {
    log.error('listDevices', err);
});
