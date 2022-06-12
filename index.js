// Teradek-VidiU

var instance_skel = require('../../instance_skel');
var debug;
var log;

function instance(system, id, config) {
	var self = this;

	// super-constructor
	instance_skel.apply(this, arguments);

	self.actions(); // export actions

	return self;
}

instance.prototype.init = function () {
	var self = this;

	debug = self.debug;
	log = self.log;

	self.request = require('request');
	self.cookieJar = self.request.jar();
	self.sessionID = null;

	self.checkagainInterval;  // if no response from device, check again interval
	self.statusInterval;
	self.tempInterval;
	self.codecInterval;
	self.statusData;

	self.init_http();
	self.setFeedbackDefinitions(self.getFeedbacks());
	self.setVariableDefinitions(self.getVariables());


}

instance.prototype.updateConfig = function (config) {
	var self = this;

	self.config = config;
	self.clearIntervals();
	self.init_http();
}

instance.prototype.init_http = function () {
	var self = this;
	try {

		//go ahead and log in, get the session cookie going
		let url = `http://${self.config.host}/cgi-bin/api.cgi`;

		//if the password is blank in the instance, the default with no password set is admin
		//This is absolutely required to authenticate with the api
		var formData;

		if (self.config.passwd == "") {
			formData = {
				command: 'login',
				user: 'admin',
				passwd: 'admin'
			};
		} else {
			formData = {
				command: 'login',
				user: 'admin',
				passwd: self.config.passwd
			};
		}


		self.request.post({ url: url, form: formData, jar: self.cookieJar }, function (error, response, body) {
			//console.log(body);
			if (body === '##Invalid password#') {
				//password was not valid
				self.status(self.STATUS_ERROR, 'Invalid Password');
				self.log('debug', 'init_http: Invalid Password');  // Temporary debug
			}
			else if (response && response.headers) {
				self.status(self.STATE_OK);
				clearInterval(self.checkagainInterval);  // device is on network, so clear check again
				self.log('info', 'State is OK');  // Temporary debug
				let cookies = response.headers['set-cookie'];
				try {
					let cookiesString = cookies.toString();
					let sesID_s = cookiesString.indexOf('serenity-session=');
					let sesID_e = cookiesString.indexOf(';', sesID_s);
					self.sessionID = cookiesString.substring(sesID_s + 17, sesID_e);
				} catch (error) {
					self.status(self.STATUS_ERROR, 'Session not authenticated.');
					self.log('debug', 'init_http: Session not authenticated.');  // Temporary debug
				}
				// Set Interval collections if not a VidiU Go
				if (self.config.is_vidiugo != 'yes') {
					self.statusInterval = setInterval(function () {
						self.getCommand("status", "system.cgi?command=status");
					}, 500)
					self.tempInterval = setInterval(function () {
						self.getCommand("temp", "json.cgi?command=geti&q=System.Info.CPU.Temp");
					}, 1000);
					self.codecInterval = setInterval(function () {
						self.getCommand("codec", "json.cgi?command=geti&q=Codec.Status");
					}, 500);
				} else {
					self.setStatusCheck(); // VidiU Go status using setTimeout
				}
				self.getCommand("product", "json.cgi?command=geti&q=System.Info.Product");

			} else {
				self.status(self.STATUS_ERROR, 'Request failed');
				self.checkDeviceOnline();  // Check in a bit to see if the device comes on network
			}
		});
	}
	catch (error) {
		self.log('error', error.message); //	self.log('error', error);
		self.status(self.STATUS_ERROR, 'Session not authenticated.');
	}
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
		},
		{
			type: 'dropdown',
			label: 'Reduce functionality for VidiU Go compatibility?',
			id: 'is_vidiugo',
			default: 'no',
			width: 6,
			choices: [
				{ id: 'no', label: 'No' },
				{ id: 'yes', label: 'Yes' },
			],
		}
	]
};

// When module gets deleted
instance.prototype.destroy = function () {
	var self = this;
	self.clearIntervals();
	debug("destroy", self.id);
}

instance.prototype.clearIntervals = function () {
	var self = this;
	
	clearInterval(self.checkagainInterval);  // clear check again if service is running
	clearInterval(self.statusInterval);
	clearInterval(self.tempInterval);
	clearInterval(self.codecInterval);
}


instance.prototype.actions = function () {
	var self = this;

	self.setActions({

		'start_broadcasting': {
			label: 'Start Broadcasting'
		},
		'stop_broadcasting': {
			label: 'Stop Broadcasting'
		},
		'toggle_broadcasting': {
			label: 'Toggle Broadcasting'
		},
		'start_recording': {
			label: 'Start Recording'
		},
		'stop_recording': {
			label: 'Stop Recording'
		},
		'toggle_recording': {
			label: 'Toggle Recording'
		}

	});
}

// Set Timeout for status check - VidiU Go Compatibility
instance.prototype.setStatusCheck = function () {
	var self = this;

	if (self.config.is_vidiugo == 'yes') {
		self.statusInterval = setTimeout(function () {
			self.getCommand("status", "system.cgi?command=status");
		}, 1000)
	}
	
}

// See if the device comes on network in an interval - VidiU Go Compatibility
instance.prototype.checkDeviceOnline = function () {
	var self = this;

	if (self.config.is_vidiugo == 'yes') {
		self.checkagainInterval  = setTimeout(function () {
			self.init_http();
		}, 10000);
	}	
	
}



instance.prototype.getCommand = function (cmd, path) {
	var self = this;

	let url = 'http://' + self.config.host + "/cgi-bin/" + path;
	try {
		if (self.sessionID !== null) {
			let cookieJarAuth = self.request.jar();
			let cookie1 = self.request.cookie('fw_ver=3.0.8');
			let cookie2 = self.request.cookie('passwordChanged=true');
			let cookie3 = self.request.cookie('serenity-session=' + self.sessionID);
			cookieJarAuth.setCookie(cookie1, url);
			cookieJarAuth.setCookie(cookie2, url);
			cookieJarAuth.setCookie(cookie3, url);

			self.request.get({ url: url, jar: cookieJarAuth }, function (error, response, body) {
				try {
					if (body.toString() === '##Access denied#') {
						self.status(self.STATUS_ERROR, 'Access denied.');
					}

					else if (JSON.parse(body).result === 'success' || cmd == "temp" || cmd == "product" || cmd == "codec") {
						self.status(self.STATE_OK);
						var returnData = JSON.parse(body);

						switch (cmd) {
							case 'status':
								self.statusData = returnData.status;
								self.checkFeedbacks('live_state');
								self.checkFeedbacks('record_state');
								self.checkFeedbacks('broadcast_error');

								var systemPower = self.statusData['System-Power'].split(":");

								self.setVariable('power_source', systemPower[0]);
								self.setVariable('battery_percentage', systemPower[1]);
								self.setVariable('battery_charging', systemPower[3]);

								var videoInput = self.statusData['Video-Input'].split(":");

								self.setVariable('video_input', videoInput[0]);
								self.setVariable('video_state', videoInput[1]);

								self.setVariable('network_uplink', self.statusData['Network-Uplink']);
								self.setVariable('broadcast_state', self.statusData['Broadcast-State']);
								self.setVariable('codec_state', self.statusData['Codec-State']);
								self.setVariable('broadcast_error', self.statusData['Broadcast-Error']);

								self.setStatusCheck();  // VidiU Go status using setTimeout

								break;

							case 'temp':
								self.setVariable('cpu_temp_f', returnData.System.Info.CPU.Temp['f']);
								self.setVariable('cpu_temp_c', returnData.System.Info.CPU.Temp['c']);
								break;

							case 'product':
								self.setVariable('vidiu_type', returnData.System.Info.Product['productname']);
								self.setVariable('vidiu_serial', returnData.System.Info.Product['serialnumber']);
								self.setVariable('vidiu_firmversion', returnData.System.Info.Product['productversion']);
								break;

							case 'codec':
								var codecStream = JSON.parse(returnData.Codec.Status['stream1']);
								self.setVariable('stream1_bitrate', codecStream['encoder']['current_bitrate']);
								break;

						}
					}
					else {
						self.status(self.STATUS_ERROR, 'Unknown error.');
					}
				} catch (error) {
					let myerror = 'Get command '+ cmd +': ' + error.message;	
					self.log('error', myerror);
					self.status(self.STATUS_ERROR, myerror);	
					self.clearIntervals();
					self.init_http();
				}
			});
		}
		else {
			//throw an error because we aren't authenticated yet
			self.status(self.STATUS_ERROR, 'Session not authenticated.');
			self.clearIntervals();
			self.init_http();
		}
	} catch (error) {
		// If VidiU Go, don't send unedited error
		if (self.config.is_vidiugo == 'yes') {
			self.log('error', 'Session not authenticated error suspected while get command.');
		} else {
			self.log('error', error);
		}	
		self.status(self.STATUS_ERROR, 'Session not authenticated.');
		self.clearIntervals();
		self.init_http();
	}
}

instance.prototype.action = function (action) {
	var self = this;
	var cmd;
	var options = action.options;

	switch (action.action) {
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
		case 'toggle_recording':
			var recordStatus = self.statusData['Record-Status'].split(":");
			if (recordStatus[0] == 1) {
				cmd = '/cgi-bin/system.cgi?command=recording&action=stop';
			} else {
				cmd = '/cgi-bin/system.cgi?command=recording&action=start';
			}
			break;
		case 'toggle_broadcasting':
			if (self.statusData['Broadcast-State'] == "Live") {
				cmd = '/cgi-bin/system.cgi?command=broadcast&action=stop';
			} else {
				cmd = '/cgi-bin/system.cgi?command=broadcast&action=start';
			}
			break;
	}


	if (cmd !== undefined) {
		let url = 'http://' + self.config.host + cmd;

		if (self.sessionID !== null) {
			let cookieJarAuth = self.request.jar();
			let cookie1 = self.request.cookie('fw_ver=3.0.8');
			let cookie2 = self.request.cookie('passwordChanged=true');
			let cookie3 = self.request.cookie('serenity-session=' + self.sessionID);
			cookieJarAuth.setCookie(cookie1, url);
			cookieJarAuth.setCookie(cookie2, url);
			cookieJarAuth.setCookie(cookie3, url);

			self.request.get({ url: url, jar: cookieJarAuth }, function (error, response, body) {
				try {
					if (body.toString() === '##Access denied#') {
						self.status(self.STATUS_ERROR, 'Access denied.');
					}
					else if (JSON.parse(body).result === 'success') {
						self.status(self.STATE_OK);
					}
					else {
						self.status(self.STATUS_ERROR, 'Unknown error.');
					}
				} catch (error) {
					self.status(self.STATUS_ERROR, error);
					self.clearIntervals();
					self.init_http();
				}
			});
		}
		else {
			//throw an error because we aren't authenticated yet
			self.status(self.STATUS_ERROR, 'Session not authenticated.');
		}
	}
}


instance.prototype.getFeedbacks = function () {
	var self = this;

	let feedbacks = {};

	feedbacks['live_state'] = {
		label: 'Color for encoder live state',
		description: 'Set Button colors for encoder live state',
		options: [{
			type: 'colorpicker',
			label: 'Foreground color for Ready state',
			id: 'fg_ready',
			default: '16777215'
		},
		{
			type: 'colorpicker',
			label: 'Background color for Ready state',
			id: 'bg_ready',
			default: this.rgb(51, 102, 0),
		},
		{
			type: 'colorpicker',
			label: 'Foreground color for Starting state',
			id: 'fg_starting',
			default: '16777215'
		},
		{
			type: 'colorpicker',
			label: 'Background color for Starting state',
			id: 'bg_starting',
			default: this.rgb(255, 153, 0)
		},
		{
			type: 'colorpicker',
			label: 'Foreground color for Stopping state',
			id: 'fg_stopping',
			default: '16777215'
		},
		{
			type: 'colorpicker',
			label: 'Background color for Stopping state',
			id: 'bg_stopping',
			default: this.rgb(255, 153, 0)
		},
		{
			type: 'colorpicker',
			label: 'Foreground color for Live state',
			id: 'fg_live',
			default: '16777215'
		},
		{
			type: 'colorpicker',
			label: 'Background color for Live state',
			id: 'bg_live',
			default: this.rgb(255, 0, 0),
		},

		],
		callback: (feedback, bank) => {

			switch (self.statusData['Broadcast-State']) {
				case 'Live':
					return {
						color: feedback.options.fg_live,
						bgcolor: feedback.options.bg_live,
					};
					break;
				case 'Starting':
					return {
						color: feedback.options.fg_starting,
						bgcolor: feedback.options.bg_starting,
					};
					break;
				case 'Ready':
					return {
						color: feedback.options.fg_ready,
						bgcolor: feedback.options.bg_ready,
					};
				case 'Stopping':
					return {
						color: feedback.options.fg_stopping,
						bgcolor: feedback.options.bg_stopping,
					};
					break;
			}

		}
	}


	feedbacks['record_state'] = {
		label: 'Color for encoder recording state',
		description: 'Set Button colors for encoder recording state',
		options: [{
			type: 'colorpicker',
			label: 'Foreground color for Ready state',
			id: 'fg_ready',
			default: '16777215'
		},
		{
			type: 'colorpicker',
			label: 'Background color for Ready state',
			id: 'bg_ready',
			default: this.rgb(51, 102, 0),
		},
		{
			type: 'colorpicker',
			label: 'Foreground color for Recording state',
			id: 'fg_recording',
			default: '16777215'
		},
		{
			type: 'colorpicker',
			label: 'Background color for Recording state',
			id: 'bg_recording',
			default: this.rgb(255, 0, 0),
		},

		],
		callback: (feedback, bank) => {

			var recordStatus = self.statusData['Record-Status'].split(":");
			switch (recordStatus[0]) {
				case '1':
					return {
						color: feedback.options.fg_recording,
						bgcolor: feedback.options.bg_recording,
					};
					break;
				case '0':
					return {
						color: feedback.options.fg_ready,
						bgcolor: feedback.options.bg_ready,
					};
					break;
			}

		}
	}

	feedbacks['broadcast_error'] = {
		label: 'Color for broadcast error',
		description: 'Set Button colors for encoder last broadcast error',
		options: [{
			type: 'colorpicker',
			label: 'Foreground color for OK state',
			id: 'fg_ok',
			default: '16777215'
		},
		{
			type: 'colorpicker',
			label: 'Background color for OK state',
			id: 'bg_ok',
			default: this.rgb(51, 102, 0),
		},
		{
			type: 'colorpicker',
			label: 'Foreground color for Error state',
			id: 'fg_error',
			default: '16777215'
		},
		{
			type: 'colorpicker',
			label: 'Background color for Error state',
			id: 'bg_error',
			default: this.rgb(255, 0, 0),
		},

		],
		callback: (feedback, bank) => {

			if (self.statusData['Broadcast-Error'] == "none") {
				return {
					color: feedback.options.fg_ok,
					bgcolor: feedback.options.bg_ok,
				};
			} else {
				return {
					color: feedback.options.fg_error,
					bgcolor: feedback.options.bg_error,
				};
			}


		}
	}
	return feedbacks;
}

instance.prototype.getVariables = function () {

	var variables = [
		{
			label: 'Vidiu Product',
			name: 'vidiu_type'
		},
		{
			label: 'Vidiu Serial',
			name: 'vidiu_serial'
		},
		{
			label: 'Vidiu Firmware Version',
			name: 'vidiu_firmversion'
		},
		{
			label: 'Broadcast State',
			name: 'broadcast_state'
		},
		{
			label: 'Codec State',
			name: 'codec_state'
		},
		{
			label: 'Last Broadcast Error',
			name: 'broadcast_error'
		},
		{
			label: 'Current Power Source',
			name: 'power_source'
		},
		{
			label: 'Battery Percentage',
			name: 'battery_percentage'
		},
		{
			label: 'Battery Charging',
			name: 'battery_charging'
		},
		{
			label: 'Video Input',
			name: 'video_input'
		},
		{
			label: 'Video State',
			name: 'video_state'
		},
		{
			label: 'Network Uplink',
			name: 'network_uplink'
		},
		{
			label: 'CPU Temp C',
			name: 'cpu_temp_c'
		},
		{
			label: 'CPU Temp F',
			name: 'cpu_temp_f'
		},
		{
			label: 'Stream 1 Bitrate',
			name: 'stream1_bitrate'
		},

	];
	return variables;
}

instance_skel.extendedBy(instance);
exports = module.exports = instance;