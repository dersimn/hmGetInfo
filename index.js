const pkg = require('./package.json');
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

const log = require('yalm');
log.setLevel(config.verbosity);

const cliProgress = require('cli-progress');
const progressBar = new cliProgress.Bar({
    format: 'Collecting paramsets [{bar}] {percentage}% | ETA: {eta}s | {value}/{total}'
});

const allDevices = {};

const client = xmlrpc.createClient({
    host: config.ccuAddress,
    port: config.ccuPort,
    path: '/'
});

(async () => {
    const devices = await methodCall('listDevices', null);
    progressBar.start(devices.length);

    for (const device of devices) {
        const [serial, channel] = procAddress(device.ADDRESS);
        log.debug(serial, channel);

        allDevices[serial] ||= {}; // Initialize object if not exists yet
        allDevices[serial][channel] = {
            ...device,
            FLAGS: transformFlags(device.FLAGS),
            PARAMSETS: Object.fromEntries(device.PARAMSETS.map(p => [p, null])) // Turn Array into empty Object
        };

        for (const paramsetName of device.PARAMSETS) {
            // Section: getParamsetDescription
            log.debug('getParamsetDescription', serial, channel, paramsetName);

            const paramsetDescription = await methodCall('getParamsetDescription', [device.ADDRESS, paramsetName]);
            allDevices[serial][channel].PARAMSETS[paramsetName] = paramsetDescription;

            // Transform to human readable format, see HM_XmlRpc_API.pdf, page 5
            for (const [param, description] of Object.entries(paramsetDescription)) {
                allDevices[serial][channel].PARAMSETS[paramsetName][param].OPERATIONS = transformOperations(description.OPERATIONS);
                allDevices[serial][channel].PARAMSETS[paramsetName][param].FLAGS = transformOperations(description.FLAGS);
            }

            // Section: getParamset
            log.debug('getParamset', serial, channel, paramsetName);
            try {
                const paramset = await methodCall('getParamset', [device.ADDRESS, paramsetName]);

                // Turn { FOO: 0.5, BAR: 1.0 } into { FOO: {VALUE: 0.5}, BAR: {VALUE: 1.0} }
                for (const [param, value] of Object.entries(paramset)) {
                    allDevices[serial][channel].PARAMSETS[paramsetName][param].VALUE = value;
                }
            } catch (error) {
                log.error('getParamset', serial, channel, paramsetName, error);
            }
        }

        progressBar.increment();
    }

    jsonfile.writeFile(config.outputDestination, allDevices, {spaces: 2}, error => {
        if (error) {
            log.error('jsonfile.writeFile', error);
        }
    });

    progressBar.stop();
})().catch(error => {
    log.error(error);
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
    return {
        VISIBLE: Boolean(flagObject & 0x01),
        INTERNAL: Boolean(flagObject & 0x02),
        TRANSFORM: Boolean(flagObject & 0x04),
        SERVICE: Boolean(flagObject & 0x08),
        STICKY: Boolean(flagObject & 0x10)
    };
}

function transformOperations(opObject) {
    return {
        READ: Boolean(opObject & 1),
        WRITE: Boolean(opObject & 2),
        EVENT: Boolean(opObject & 4)
    };
}

function procAddress(address) {
    if (/:\d+$/.test(address)) {
        const match = /([A-Za-z\d-]+):(\d+)/.exec(address);
        return [match[1], match[2]];
    }

    return [address, 'root'];
}
