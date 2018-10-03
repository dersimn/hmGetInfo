Collect paramsets and paramsetDescriptions from your Homematic CCU as JSON, similar to: 

	  "LEQ1519968:4": {
	    "ADDRESS": "LEQ1519968:4",
	    "AES_ACTIVE": 0,
	    "DIRECTION": 1,
	    "FLAGS": {
	      "VISIBLE": true,
	      "INTERNAL": false,
	      "TRANSFORM": false,
	      "SERVICE": false,
	      "STICKY": false
	    },
	    "INDEX": 4,
	    "LINK_SOURCE_ROLES": "CLIMATECONTROL_RT",
	    "LINK_TARGET_ROLES": "",
	    "PARAMSETS": {
	      "LINK": {},
	      "VALUES": {
	        "ACTUAL_TEMPERATURE": {
	          "VALUE": 18.9,
	          "CONTROL": "HEATING_CONTROL.TEMPERATURE",
	          "DEFAULT": 0,
	          "FLAGS": {
	            "VISIBLE": true,
	            "INTERNAL": false,
	            "TRANSFORM": false,
	            "SERVICE": false,
	            "STICKY": false
	          },
	          "ID": "ACTUAL_TEMPERATURE",
	          "MAX": 56,
	          "MIN": -10,
	          "OPERATIONS": {
	            "READ": true,
	            "WRITE": false,
	            "EVENT": true
	          },
	          "TAB_ORDER": 5,
	          "TYPE": "FLOAT",
	          "UNIT": "�C"
	        },


## Usage

### Native

	git pull https://github.com/dersimn/hmGetInfo
	cd hmGetInfo
	npm install
	node index.js --ccu-address 10.1.1.112

### Docker

	docker run --rm dersimn/hmgetinfo --ccu-address 10.1.1.112 --prefer-stdout > data.json

