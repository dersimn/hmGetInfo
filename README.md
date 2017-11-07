Get app Values, Paramsets and ParamsetDescriptions from your CCU

## Usage

	git pull https://github.com/dersimn/hmGetInfo
	cd hmGetInfo
	npm install
	node index.js --ccu-address 10.1.1.112

Results will be stored in `data.json`:

	{
	  "BidCoS-RF": {
	    "ADDRESS": "BidCoS-RF",
	    "CHILDREN": [ // ...
	    ],
	    "FIRMWARE": "2.29.22",
	    "FLAGS": {
	      "VISIBLE": true,
	      "INTERNAL": false,
	      "TRANSFORM": false,
	      "SERVICE": true,
	      "STICKY": false
	    },
	    "INTERFACE": "NEQ0605230",
	    "PARAMSETS": {
	      "MASTER": {}
	    },
	    "PARENT": "",
	    "RF_ADDRESS": 4996468,
	    "ROAMING": 0,
	    "RX_MODE": 1,
	    "TYPE": "HM-RCV-50",
	    "UPDATABLE": 0,
	    "VERSION": 6
	  },
	  "BidCoS-RF:0": {
	// ...