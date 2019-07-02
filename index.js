// Teradek-VidiU

var instance_skel = require('../../instance_skel');
var debug;
var log;

var request = require('request');
var cookieJar = request.jar();
var sessionID = null;

function instance(system, id, config) {
	var self = this;

	// super-constructor
	instance_skel.apply(this, arguments);

	self.actions(); // export actions

	return self;
}

instance.prototype.init = function() {
	var self = this;

	debug = self.debug;
	log = self.log;

	self.init_http();
}

instance.prototype.updateConfig = function(config) {
	var self = this;

	self.config = config;
	self.init_http();
}

instance.prototype.init_http = function() {
	var self = this;
	
	//go ahead and log in, get the session cookie going
	let url = `http://${self.config.host}/cgi-bin/api.cgi`;
	
	let formData = {
		command: 'login',
		user: 'admin',
		passwd: self.config.passwd
	};
	
	request.post({url: url, form: formData, jar: cookieJar}, function(error, response, body) {
		if (body==='##Invalid password#') {
			//password was not valid
			self.status(self.STATUS_ERROR, 'Invalid Password');
		}
		else {     
			self.status(self.STATE_OK);
            let cookies = response.headers['set-cookie'];
            let cookiesString = cookies.toString();
            let sesID_s = cookiesString.indexOf('serenity-session=');
            let sesID_e = cookiesString.indexOf(';', sesID_s);
            sessionID = cookiesString.substring(sesID_s+17, sesID_e);
		}
	});

	debug = self.debug;
	log = self.log;
}

// Return config fields for web config
instance.prototype.config_fields = function () {
	var self = this;

	return [
		{
			type: 'text',
			id: 'info',
			width: 12,
			label: 'Information',
			value: 'This module will connect to a Teradek VidiU and allow you to start/stop broadcasting.'
		},
		{
			type: 'textinput',
			id: 'host',
			label: 'IP Address',
			width: 6,
			default: '192.168.32.2',
			regex: self.REGEX_IP
		},
		{
			type: 'textinput',
			id: 'passwd',
			label: 'Password',
			width: 6,
			default: ''
		}
	]
};

// When module gets deleted
instance.prototype.destroy = function() {
	var self = this;

	debug("destroy", self.id);
}

instance.prototype.actions = function() {
	var self = this;

	self.system.emit('instance_actions', self.id, {

		'start_broadcasting': {
			label: 'Start Broadcasting'
		},
		'stop_broadcasting': {
			label: 'Stop Broadcasting'
		},
		'start_recording': {
			label: 'Start Recording'
		},
		'stop_recording': {
			label: 'Stop Recording'
		}

	});
}

instance.prototype.action = function(action) {
	var self = this;
	var cmd;
	var options = action.options;
	
	switch(action.action) {
		case 'start_broadcasting':
			cmd = '/cgi-bin/system.cgi?command=broadcast&action=start';
			break;
		case 'stop_broadcasting':
			cmd = '/cgi-bin/system.cgi?command=broadcast&action=stop';
			break;
		case 'start_recording':
			cmd = '/cgi-bin/system.cgi?command=recording&action=start';
			break;
		case 'stop_recording':
			cmd = '/cgi-bin/system.cgi?command=recording&action=stop';
			break;
	}

	if (cmd !== undefined) {
		let url = 'http://' + self.config.host + cmd;
		
		if (sessionID !== null) {
			let cookieJarAuth = request.jar();
			let cookie1 = request.cookie('fw_ver=3.0.8');
			let cookie2 = request.cookie('passwordChanged=true');
			let cookie3 = request.cookie('serenity-session=' + sessionID);
			cookieJarAuth.setCookie(cookie1, url);
			cookieJarAuth.setCookie(cookie2, url);
			cookieJarAuth.setCookie(cookie3, url);

			request.get({url: url, jar: cookieJarAuth}, function (error, response, body) {
                if (body.toString() === '##Access denied#') {
                    self.status(self.STATUS_ERROR, 'Access denied.');
                }
                else if (JSON.parse(body).result === 'success') {
                    self.status(self.STATE_OK);
                }
                else {
                    self.status(self.STATUS_ERROR, 'Unknown error.');
                }
			});
		}
		else {
			//throw an error because we aren't authenticated yet
			self.status(self.STATUS_ERROR, 'Session not authenticated.');
		}
	}
}

instance_skel.extendedBy(instance);
exports = module.exports = instance;