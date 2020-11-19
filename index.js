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
        verbosity: 'debug',
        'ccu-port': 2001,
        outputDestination: './output/data.json'
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
            if (error) {
                reject(error);
            } else {
                resolve(value);
            }
        });
    });
}

function transformFlags(flagObject) {
    const flags = new Object();

    flags.VISIBLE = Boolean(flagObject & 0x01);
    flags.INTERNAL = Boolean(flagObject & 0x02);
    flags.TRANSFORM = Boolean(flagObject & 0x04);
    flags.SERVICE = Boolean(flagObject & 0x08);
    flags.STICKY = Boolean(flagObject & 0x10);

    return flags;
}

function transformOperations(opObject) {
    const operations = new Object();

    operations.READ = Boolean(opObject & 1);
    operations.WRITE = Boolean(opObject & 2);
    operations.EVENT = Boolean(opObject & 4);

    return operations;
}

function procAddress(address) {
    if (/:\d+$/.test(address)) {
        const match = /([A-Za-z\d\-]+):(\d+)/.exec(address);
        return [match[1], match[2]];
    }

    return [address, '_root'];
}

methodCall('listDevices', null).then(response => {
    response.forEach(device => {
        if (device.ADDRESS.startsWith('BidCoS')) {
            return;
        } // Skip BidCoS devices

        const [serial, channel] = procAddress(device.ADDRESS);

        allDevices[serial] = Object.assign({}, allDevices[serial]); // Initialize object if not exists yet
        allDevices[serial][channel] = Object.assign({}, device); // Initialize object if not exists yet
        allDevices[serial][channel].FLAGS = transformFlags(allDevices[serial][channel].FLAGS);

        // Convert PARAMSETS from Array to Object
        allDevices[serial][channel].PARAMSETS = new Object();
        device.PARAMSETS.forEach(paramset => {
            allDevices[serial][channel].PARAMSETS[paramset] = new Object();
        });

        // Iterate through all PARAMSETS
        device.PARAMSETS.forEach(paramset => {
            // Assign values of each paramset
            queue.add(() => methodCall('getParamset', [device.ADDRESS, paramset]).then(response => {
                // Turn { FOO: 0.5, BAR: 1.0 } into { FOO: {VALUE: 0.5}, BAR: {VALUE: 1.0} }
                const temporary = new Object();
                for (const key in response) {
                    temporary[key] = {VALUE: response[key]};
                }

                deepExtend(allDevices[serial][channel].PARAMSETS[paramset], temporary);
            }).catch(error => {
                log.error('getParamset', device.ADDRESS, paramset, error.faultCode, error.faultString);
            }));

            queue.add(() => methodCall('getParamsetDescription', [device.ADDRESS, paramset]).then(response => {
                deepExtend(allDevices[serial][channel].PARAMSETS[paramset], response);

                // Transform to human readable format, see HM_XmlRpc_API.pdf, page 5
                for (const key in response) {
                    allDevices[serial][channel].PARAMSETS[paramset][key].OPERATIONS = transformOperations(response[key].OPERATIONS);
                }

                for (const key in response) {
                    allDevices[serial][channel].PARAMSETS[paramset][key].FLAGS = transformFlags(response[key].FLAGS);
                }
            }).catch(error => {
                log.error('getParamsetDescription', device.ADDRESS, paramset, error.faultCode, error.faultString);
            }));
        });
    });

    queue.onIdle().then(() => {
        log.debug('finished');
        clearInterval(interval);

        jsonfile.writeFile(config.outputDestination, allDevices, {spaces: 2}, err => {
            if (err) {
                log.error('jsonfile.writeFile', err);
            }
        });

        progressbar.stop();
    }).catch(error => {
        log.error('queue error', error);
    });
    queue.start();

    const max_queuesize = queue.size;
    progressbar.start(max_queuesize, 0);

    var interval = setInterval(() => {
        progressbar.update(max_queuesize - queue.size);
    }, 100);
}).catch(error => {
    log.error('listDevices', error);
});
