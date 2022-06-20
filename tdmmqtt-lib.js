// Built automatically - don't edit!

/*
	Copyright 2022 ECOLE POLYTECHNIQUE FEDERALE DE LAUSANNE,
	Miniature Mobile Robots group, Switzerland
	Author: Yves Piguet
*/

class Message {
	constructor(props, key) {
		this.props = props;
		this.key = key;
	}

	static hmacSHA256(data, key) {
		function byteStringToWordArray(b) {
			return CryptoJS.enc.Base64.parse(btoa(b));
		}

		return CryptoJS.HmacSHA256(byteStringToWordArray(data), byteStringToWordArray(key));
	}

	toString() {
		var j = JSON.stringify(this.props);
		var c = Message.uint8ToStr(pako.deflate(j));
		var h = Message.hexaToStr(Message.hmacSHA256(c, this.key).toString());
		var hc = h + c;
		var str = btoa(hc);
		return str;
	}

	static fromString(str, key) {
		var hc = atob(str);
		var h = hc.slice(0, 32);
		var c = hc.slice(32);
		if (Message.hexaToStr(Message.hmacSHA256(c, key).toString()) !== h) {
			return null;
		}
		var j = Message.uint8ToStr(pako.inflate(Message.strToUint8(c)));
		var msg = new Message(JSON.parse(j), Message.strToUint8(key));
		return msg;
	}

	static hexaToStr(h) {
		var str = "";
		for (var i = 0; i < h.length; i += 2) {
			str += String.fromCharCode(parseInt(h.slice(i, i + 2), 16));
		}
		return str;
	}

	static uint8ToStr(a) {
		var str = "";
		for (var i = 0; i < a.length; i++) {
			str += String.fromCharCode(a[i]);
		}
		return str;
	}

	static strToUint8(str) {
		var a = [];
		for (var i = 0; i < str.length; i++) {
			a.push(str.charCodeAt(i));
		}
		return new Uint8Array(a);
	}
}

class TDMMQTTClient {
	// use <script src="https://cdnjs.cloudflare.com/ajax/libs/paho-mqtt/1.0.1/mqttws31.min.js" type="text/javascript"></script>
	// doc: https://www.eclipse.org/paho/files/jsdoc/index.html

	constructor(host, port, useSSL, username, password, topic, key, qos) {
		this.host = host;
		this.port = port || (useSSL ? 443 : 80);
		this.useSSL = useSSL;
		this.username = username;
		this.password = password;
		// topic used to publish (to the tdm)
		this.topic = topic;
		// topic used to subscribe (from the tdm)
		this.topicReply = "topic" + "-R";
		this.key = key;
		this.qos = qos == undefined ? null : qos;
		this.autoReconnect = true;
		this.onConnectionError = null;	// or function():void
		this.mqtt = null;
		this.connected = false;
		this.outgoingMsgQueue = [];
		this.disconnectOnceFlushed = false;

		// this.onmessageDict[topic]: function (decoded_message):void
		this.onmessageDict = {};
	}

	connect(fun) {
		if (this.mqtt) {
			return;
		}
		this.mqtt = new Paho.MQTT.Client(this.host, this.port, "clientjs");
		this.mqtt.onConnectionLost = () => {
			this.mqtt = null;
			this.connected = false;
			if (this.onConnectionError) {
				this.onConnectionError();
			}
			this.scheduleReconnection();
		};
		this.mqtt.onMessageArrived = (message) => {
			const onmessage = this.onmessageDict[message.destinationName];
			if (onmessage) {
				const msg = Message.fromString(message.payloadString, this.key);
				if (msg != null) {
					onmessage(msg);
				}
			}
		};
		var options = {
			timeout: 3,	// connection timeout in seconds
			useSSL: this.useSSL,
			keepAliveInterval: 10,	// seconds
			onSuccess: () => {
				this.connected = true;
				// send again messages which failed because of a disconnection
				while (this.outgoingMsgQueue.length > 0) {
					this.mqtt.send(this.topic, this.outgoingMsgQueue.shift(), this.qos || 0, false);
				}
				if (fun) {
					fun();
				}
				if (this.disconnectOnceFlushed) {
					this.disconnect();
				}
			},
			onFailure: (err) => {
				this.mqtt = null;
				this.connected = false;
				if (this.onConnectionError) {
					this.onConnectionError();
				}
				this.scheduleReconnection();
			}
		};
		if (this.username) {
			options.userName = this.username;	// not a typo
			if (this.password) {
				options.password = this.password;
			}
		}
		this.mqtt.connect(options);
	}

	isConnected() {
		return this.connected;
	}

	disconnect() {
		this.mqtt.disconnect();
		this.mqtt = null;
	}

	scheduleReconnection(fun) {
		if (this.autoReconnect) {
			setTimeout(() => {
				if (this.autoReconnect) {
					// autoreconnection still wanted
					this.connect(fun);
				}
			}, 1);
		}
	}

	send(props, thenDisconnect) {
		var msg = new Message(props, this.key);
		var msgStr = msg.toString();
		try {
			this.mqtt.send(this.topic, msgStr, this.qos || 0, false);
			if (this.thenDisconnect) {
				this.disconnect();
			}
		} catch (Error) {
			this.mqtt = null;
			this.outgoingMsgQueue.push(msgStr);
			if (thenDisconnect) {
				this.disconnectOnceFlushed = true;
			}
			this.scheduleReconnection(() => this.send(props));
		}
	}

	subscribe(topic, onmessage) {
		if (onmessage == null) {
			delete this.onmessageDict[topic];
			this.mqtt.unsubscribe(topic);
		} else {
			this.onmessageDict[topic] = onmessage;
			this.mqtt.subscribe(topic);
		}
	}
}
/*******************************************************************************
 * Copyright (c) 2013 IBM Corp.
 *
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v1.0
 * and Eclipse Distribution License v1.0 which accompany this distribution.
 *
 * The Eclipse Public License is available at
 *    http://www.eclipse.org/legal/epl-v10.html
 * and the Eclipse Distribution License is available at
 *   http://www.eclipse.org/org/documents/edl-v10.php.
 *
 * Contributors:
 *    Andrew Banks - initial API and implementation and initial documentation
 *******************************************************************************/


// Only expose a single object name in the global namespace.
// Everything must go through this module. Global Paho module
// only has a single public function, client, which returns
// a Paho client object given connection details.

/**
 * Send and receive messages using web browsers.
 * <p>
 * This programming interface lets a JavaScript client application use the MQTT V3.1 or
 * V3.1.1 protocol to connect to an MQTT-supporting messaging server.
 *
 * The function supported includes:
 * <ol>
 * <li>Connecting to and disconnecting from a server. The server is identified by its host name and port number.
 * <li>Specifying options that relate to the communications link with the server,
 * for example the frequency of keep-alive heartbeats, and whether SSL/TLS is required.
 * <li>Subscribing to and receiving messages from MQTT Topics.
 * <li>Publishing messages to MQTT Topics.
 * </ol>
 * <p>
 * The API consists of two main objects:
 * <dl>
 * <dt><b>{@link Paho.Client}</b></dt>
 * <dd>This contains methods that provide the functionality of the API,
 * including provision of callbacks that notify the application when a message
 * arrives from or is delivered to the messaging server,
 * or when the status of its connection to the messaging server changes.</dd>
 * <dt><b>{@link Paho.Message}</b></dt>
 * <dd>This encapsulates the payload of the message along with various attributes
 * associated with its delivery, in particular the destination to which it has
 * been (or is about to be) sent.</dd>
 * </dl>
 * <p>
 * The programming interface validates parameters passed to it, and will throw
 * an Error containing an error message intended for developer use, if it detects
 * an error with any parameter.
 * <p>
 * Example:
 *
 * <code><pre>
var client = new Paho.MQTT.Client(location.hostname, Number(location.port), "clientId");
client.onConnectionLost = onConnectionLost;
client.onMessageArrived = onMessageArrived;
client.connect({onSuccess:onConnect});

function onConnect() {
  // Once a connection has been made, make a subscription and send a message.
  console.log("onConnect");
  client.subscribe("/World");
  var message = new Paho.MQTT.Message("Hello");
  message.destinationName = "/World";
  client.send(message);
};
function onConnectionLost(responseObject) {
  if (responseObject.errorCode !== 0)
	console.log("onConnectionLost:"+responseObject.errorMessage);
};
function onMessageArrived(message) {
  console.log("onMessageArrived:"+message.payloadString);
  client.disconnect();
};
 * </pre></code>
 * @namespace Paho
 */

/* jshint shadow:true */
(function ExportLibrary(root, factory) {
	if(typeof exports === "object" && typeof module === "object"){
		module.exports = factory();
	} else if (typeof define === "function" && define.amd){
		define(factory);
	} else if (typeof exports === "object"){
		exports = factory();
	} else {
		//if (typeof root.Paho === "undefined"){
		//	root.Paho = {};
		//}
		root.Paho = factory();
	}
})(this, function LibraryFactory(){


	var PahoMQTT = (function (global) {

	// Private variables below, these are only visible inside the function closure
	// which is used to define the module.
	var version = "@VERSION@-@BUILDLEVEL@";

	/**
	 * @private
	 */
	var localStorage = global.localStorage || (function () {
		var data = {};

		return {
			setItem: function (key, item) { data[key] = item; },
			getItem: function (key) { return data[key]; },
			removeItem: function (key) { delete data[key]; },
		};
	})();

		/**
	 * Unique message type identifiers, with associated
	 * associated integer values.
	 * @private
	 */
		var MESSAGE_TYPE = {
			CONNECT: 1,
			CONNACK: 2,
			PUBLISH: 3,
			PUBACK: 4,
			PUBREC: 5,
			PUBREL: 6,
			PUBCOMP: 7,
			SUBSCRIBE: 8,
			SUBACK: 9,
			UNSUBSCRIBE: 10,
			UNSUBACK: 11,
			PINGREQ: 12,
			PINGRESP: 13,
			DISCONNECT: 14
		};

		// Collection of utility methods used to simplify module code
		// and promote the DRY pattern.

		/**
	 * Validate an object's parameter names to ensure they
	 * match a list of expected variables name for this option
	 * type. Used to ensure option object passed into the API don't
	 * contain erroneous parameters.
	 * @param {Object} obj - User options object
	 * @param {Object} keys - valid keys and types that may exist in obj.
	 * @throws {Error} Invalid option parameter found.
	 * @private
	 */
		var validate = function(obj, keys) {
			for (var key in obj) {
				if (obj.hasOwnProperty(key)) {
					if (keys.hasOwnProperty(key)) {
						if (typeof obj[key] !== keys[key])
							throw new Error(format(ERROR.INVALID_TYPE, [typeof obj[key], key]));
					} else {
						var errorStr = "Unknown property, " + key + ". Valid properties are:";
						for (var validKey in keys)
							if (keys.hasOwnProperty(validKey))
								errorStr = errorStr+" "+validKey;
						throw new Error(errorStr);
					}
				}
			}
		};

		/**
	 * Return a new function which runs the user function bound
	 * to a fixed scope.
	 * @param {function} User function
	 * @param {object} Function scope
	 * @return {function} User function bound to another scope
	 * @private
	 */
		var scope = function (f, scope) {
			return function () {
				return f.apply(scope, arguments);
			};
		};

		/**
	 * Unique message type identifiers, with associated
	 * associated integer values.
	 * @private
	 */
		var ERROR = {
			OK: {code:0, text:"AMQJSC0000I OK."},
			CONNECT_TIMEOUT: {code:1, text:"AMQJSC0001E Connect timed out."},
			SUBSCRIBE_TIMEOUT: {code:2, text:"AMQJS0002E Subscribe timed out."},
			UNSUBSCRIBE_TIMEOUT: {code:3, text:"AMQJS0003E Unsubscribe timed out."},
			PING_TIMEOUT: {code:4, text:"AMQJS0004E Ping timed out."},
			INTERNAL_ERROR: {code:5, text:"AMQJS0005E Internal error. Error Message: {0}, Stack trace: {1}"},
			CONNACK_RETURNCODE: {code:6, text:"AMQJS0006E Bad Connack return code:{0} {1}."},
			SOCKET_ERROR: {code:7, text:"AMQJS0007E Socket error:{0}."},
			SOCKET_CLOSE: {code:8, text:"AMQJS0008I Socket closed."},
			MALFORMED_UTF: {code:9, text:"AMQJS0009E Malformed UTF data:{0} {1} {2}."},
			UNSUPPORTED: {code:10, text:"AMQJS0010E {0} is not supported by this browser."},
			INVALID_STATE: {code:11, text:"AMQJS0011E Invalid state {0}."},
			INVALID_TYPE: {code:12, text:"AMQJS0012E Invalid type {0} for {1}."},
			INVALID_ARGUMENT: {code:13, text:"AMQJS0013E Invalid argument {0} for {1}."},
			UNSUPPORTED_OPERATION: {code:14, text:"AMQJS0014E Unsupported operation."},
			INVALID_STORED_DATA: {code:15, text:"AMQJS0015E Invalid data in local storage key={0} value={1}."},
			INVALID_MQTT_MESSAGE_TYPE: {code:16, text:"AMQJS0016E Invalid MQTT message type {0}."},
			MALFORMED_UNICODE: {code:17, text:"AMQJS0017E Malformed Unicode string:{0} {1}."},
			BUFFER_FULL: {code:18, text:"AMQJS0018E Message buffer is full, maximum buffer size: {0}."},
		};

		/** CONNACK RC Meaning. */
		var CONNACK_RC = {
			0:"Connection Accepted",
			1:"Connection Refused: unacceptable protocol version",
			2:"Connection Refused: identifier rejected",
			3:"Connection Refused: server unavailable",
			4:"Connection Refused: bad user name or password",
			5:"Connection Refused: not authorized"
		};

	/**
	 * Format an error message text.
	 * @private
	 * @param {error} ERROR value above.
	 * @param {substitutions} [array] substituted into the text.
	 * @return the text with the substitutions made.
	 */
		var format = function(error, substitutions) {
			var text = error.text;
			if (substitutions) {
				var field,start;
				for (var i=0; i<substitutions.length; i++) {
					field = "{"+i+"}";
					start = text.indexOf(field);
					if(start > 0) {
						var part1 = text.substring(0,start);
						var part2 = text.substring(start+field.length);
						text = part1+substitutions[i]+part2;
					}
				}
			}
			return text;
		};

		//MQTT protocol and version          6    M    Q    I    s    d    p    3
		var MqttProtoIdentifierv3 = [0x00,0x06,0x4d,0x51,0x49,0x73,0x64,0x70,0x03];
		//MQTT proto/version for 311         4    M    Q    T    T    4
		var MqttProtoIdentifierv4 = [0x00,0x04,0x4d,0x51,0x54,0x54,0x04];

		/**
	 * Construct an MQTT wire protocol message.
	 * @param type MQTT packet type.
	 * @param options optional wire message attributes.
	 *
	 * Optional properties
	 *
	 * messageIdentifier: message ID in the range [0..65535]
	 * payloadMessage:	Application Message - PUBLISH only
	 * connectStrings:	array of 0 or more Strings to be put into the CONNECT payload
	 * topics:			array of strings (SUBSCRIBE, UNSUBSCRIBE)
	 * requestQoS:		array of QoS values [0..2]
	 *
	 * "Flag" properties
	 * cleanSession:	true if present / false if absent (CONNECT)
	 * willMessage:  	true if present / false if absent (CONNECT)
	 * isRetained:		true if present / false if absent (CONNECT)
	 * userName:		true if present / false if absent (CONNECT)
	 * password:		true if present / false if absent (CONNECT)
	 * keepAliveInterval:	integer [0..65535]  (CONNECT)
	 *
	 * @private
	 * @ignore
	 */
		var WireMessage = function (type, options) {
			this.type = type;
			for (var name in options) {
				if (options.hasOwnProperty(name)) {
					this[name] = options[name];
				}
			}
		};

		WireMessage.prototype.encode = function() {
		// Compute the first byte of the fixed header
			var first = ((this.type & 0x0f) << 4);

			/*
		 * Now calculate the length of the variable header + payload by adding up the lengths
		 * of all the component parts
		 */

			var remLength = 0;
			var topicStrLength = [];
			var destinationNameLength = 0;
			var willMessagePayloadBytes;

			// if the message contains a messageIdentifier then we need two bytes for that
			if (this.messageIdentifier !== undefined)
				remLength += 2;

			switch(this.type) {
			// If this a Connect then we need to include 12 bytes for its header
			case MESSAGE_TYPE.CONNECT:
				switch(this.mqttVersion) {
				case 3:
					remLength += MqttProtoIdentifierv3.length + 3;
					break;
				case 4:
					remLength += MqttProtoIdentifierv4.length + 3;
					break;
				}

				remLength += UTF8Length(this.clientId) + 2;
				if (this.willMessage !== undefined) {
					remLength += UTF8Length(this.willMessage.destinationName) + 2;
					// Will message is always a string, sent as UTF-8 characters with a preceding length.
					willMessagePayloadBytes = this.willMessage.payloadBytes;
					if (!(willMessagePayloadBytes instanceof Uint8Array))
						willMessagePayloadBytes = new Uint8Array(payloadBytes);
					remLength += willMessagePayloadBytes.byteLength +2;
				}
				if (this.userName !== undefined)
					remLength += UTF8Length(this.userName) + 2;
				if (this.password !== undefined)
					remLength += UTF8Length(this.password) + 2;
				break;

			// Subscribe, Unsubscribe can both contain topic strings
			case MESSAGE_TYPE.SUBSCRIBE:
				first |= 0x02; // Qos = 1;
				for ( var i = 0; i < this.topics.length; i++) {
					topicStrLength[i] = UTF8Length(this.topics[i]);
					remLength += topicStrLength[i] + 2;
				}
				remLength += this.requestedQos.length; // 1 byte for each topic's Qos
				// QoS on Subscribe only
				break;

			case MESSAGE_TYPE.UNSUBSCRIBE:
				first |= 0x02; // Qos = 1;
				for ( var i = 0; i < this.topics.length; i++) {
					topicStrLength[i] = UTF8Length(this.topics[i]);
					remLength += topicStrLength[i] + 2;
				}
				break;

			case MESSAGE_TYPE.PUBREL:
				first |= 0x02; // Qos = 1;
				break;

			case MESSAGE_TYPE.PUBLISH:
				if (this.payloadMessage.duplicate) first |= 0x08;
				first  = first |= (this.payloadMessage.qos << 1);
				if (this.payloadMessage.retained) first |= 0x01;
				destinationNameLength = UTF8Length(this.payloadMessage.destinationName);
				remLength += destinationNameLength + 2;
				var payloadBytes = this.payloadMessage.payloadBytes;
				remLength += payloadBytes.byteLength;
				if (payloadBytes instanceof ArrayBuffer)
					payloadBytes = new Uint8Array(payloadBytes);
				else if (!(payloadBytes instanceof Uint8Array))
					payloadBytes = new Uint8Array(payloadBytes.buffer);
				break;

			case MESSAGE_TYPE.DISCONNECT:
				break;

			default:
				break;
			}

			// Now we can allocate a buffer for the message

			var mbi = encodeMBI(remLength);  // Convert the length to MQTT MBI format
			var pos = mbi.length + 1;        // Offset of start of variable header
			var buffer = new ArrayBuffer(remLength + pos);
			var byteStream = new Uint8Array(buffer);    // view it as a sequence of bytes

			//Write the fixed header into the buffer
			byteStream[0] = first;
			byteStream.set(mbi,1);

			// If this is a PUBLISH then the variable header starts with a topic
			if (this.type == MESSAGE_TYPE.PUBLISH)
				pos = writeString(this.payloadMessage.destinationName, destinationNameLength, byteStream, pos);
			// If this is a CONNECT then the variable header contains the protocol name/version, flags and keepalive time

			else if (this.type == MESSAGE_TYPE.CONNECT) {
				switch (this.mqttVersion) {
				case 3:
					byteStream.set(MqttProtoIdentifierv3, pos);
					pos += MqttProtoIdentifierv3.length;
					break;
				case 4:
					byteStream.set(MqttProtoIdentifierv4, pos);
					pos += MqttProtoIdentifierv4.length;
					break;
				}
				var connectFlags = 0;
				if (this.cleanSession)
					connectFlags = 0x02;
				if (this.willMessage !== undefined ) {
					connectFlags |= 0x04;
					connectFlags |= (this.willMessage.qos<<3);
					if (this.willMessage.retained) {
						connectFlags |= 0x20;
					}
				}
				if (this.userName !== undefined)
					connectFlags |= 0x80;
				if (this.password !== undefined)
					connectFlags |= 0x40;
				byteStream[pos++] = connectFlags;
				pos = writeUint16 (this.keepAliveInterval, byteStream, pos);
			}

			// Output the messageIdentifier - if there is one
			if (this.messageIdentifier !== undefined)
				pos = writeUint16 (this.messageIdentifier, byteStream, pos);

			switch(this.type) {
			case MESSAGE_TYPE.CONNECT:
				pos = writeString(this.clientId, UTF8Length(this.clientId), byteStream, pos);
				if (this.willMessage !== undefined) {
					pos = writeString(this.willMessage.destinationName, UTF8Length(this.willMessage.destinationName), byteStream, pos);
					pos = writeUint16(willMessagePayloadBytes.byteLength, byteStream, pos);
					byteStream.set(willMessagePayloadBytes, pos);
					pos += willMessagePayloadBytes.byteLength;

				}
				if (this.userName !== undefined)
					pos = writeString(this.userName, UTF8Length(this.userName), byteStream, pos);
				if (this.password !== undefined)
					pos = writeString(this.password, UTF8Length(this.password), byteStream, pos);
				break;

			case MESSAGE_TYPE.PUBLISH:
				// PUBLISH has a text or binary payload, if text do not add a 2 byte length field, just the UTF characters.
				byteStream.set(payloadBytes, pos);

				break;

				//    	    case MESSAGE_TYPE.PUBREC:
				//    	    case MESSAGE_TYPE.PUBREL:
				//    	    case MESSAGE_TYPE.PUBCOMP:
				//    	    	break;

			case MESSAGE_TYPE.SUBSCRIBE:
				// SUBSCRIBE has a list of topic strings and request QoS
				for (var i=0; i<this.topics.length; i++) {
					pos = writeString(this.topics[i], topicStrLength[i], byteStream, pos);
					byteStream[pos++] = this.requestedQos[i];
				}
				break;

			case MESSAGE_TYPE.UNSUBSCRIBE:
				// UNSUBSCRIBE has a list of topic strings
				for (var i=0; i<this.topics.length; i++)
					pos = writeString(this.topics[i], topicStrLength[i], byteStream, pos);
				break;

			default:
				// Do nothing.
			}

			return buffer;
		};

		function decodeMessage(input,pos) {
			var startingPos = pos;
			var first = input[pos];
			var type = first >> 4;
			var messageInfo = first &= 0x0f;
			pos += 1;


			// Decode the remaining length (MBI format)

			var digit;
			var remLength = 0;
			var multiplier = 1;
			do {
				if (pos == input.length) {
					return [null,startingPos];
				}
				digit = input[pos++];
				remLength += ((digit & 0x7F) * multiplier);
				multiplier *= 128;
			} while ((digit & 0x80) !== 0);

			var endPos = pos+remLength;
			if (endPos > input.length) {
				return [null,startingPos];
			}

			var wireMessage = new WireMessage(type);
			switch(type) {
			case MESSAGE_TYPE.CONNACK:
				var connectAcknowledgeFlags = input[pos++];
				if (connectAcknowledgeFlags & 0x01)
					wireMessage.sessionPresent = true;
				wireMessage.returnCode = input[pos++];
				break;

			case MESSAGE_TYPE.PUBLISH:
				var qos = (messageInfo >> 1) & 0x03;

				var len = readUint16(input, pos);
				pos += 2;
				var topicName = parseUTF8(input, pos, len);
				pos += len;
				// If QoS 1 or 2 there will be a messageIdentifier
				if (qos > 0) {
					wireMessage.messageIdentifier = readUint16(input, pos);
					pos += 2;
				}

				var message = new Message(input.subarray(pos, endPos));
				if ((messageInfo & 0x01) == 0x01)
					message.retained = true;
				if ((messageInfo & 0x08) == 0x08)
					message.duplicate =  true;
				message.qos = qos;
				message.destinationName = topicName;
				wireMessage.payloadMessage = message;
				break;

			case  MESSAGE_TYPE.PUBACK:
			case  MESSAGE_TYPE.PUBREC:
			case  MESSAGE_TYPE.PUBREL:
			case  MESSAGE_TYPE.PUBCOMP:
			case  MESSAGE_TYPE.UNSUBACK:
				wireMessage.messageIdentifier = readUint16(input, pos);
				break;

			case  MESSAGE_TYPE.SUBACK:
				wireMessage.messageIdentifier = readUint16(input, pos);
				pos += 2;
				wireMessage.returnCode = input.subarray(pos, endPos);
				break;

			default:
				break;
			}

			return [wireMessage,endPos];
		}

		function writeUint16(input, buffer, offset) {
			buffer[offset++] = input >> 8;      //MSB
			buffer[offset++] = input % 256;     //LSB
			return offset;
		}

		function writeString(input, utf8Length, buffer, offset) {
			offset = writeUint16(utf8Length, buffer, offset);
			stringToUTF8(input, buffer, offset);
			return offset + utf8Length;
		}

		function readUint16(buffer, offset) {
			return 256*buffer[offset] + buffer[offset+1];
		}

		/**
	 * Encodes an MQTT Multi-Byte Integer
	 * @private
	 */
		function encodeMBI(number) {
			var output = new Array(1);
			var numBytes = 0;

			do {
				var digit = number % 128;
				number = number >> 7;
				if (number > 0) {
					digit |= 0x80;
				}
				output[numBytes++] = digit;
			} while ( (number > 0) && (numBytes<4) );

			return output;
		}

		/**
	 * Takes a String and calculates its length in bytes when encoded in UTF8.
	 * @private
	 */
		function UTF8Length(input) {
			var output = 0;
			for (var i = 0; i<input.length; i++)
			{
				var charCode = input.charCodeAt(i);
				if (charCode > 0x7FF)
				{
					// Surrogate pair means its a 4 byte character
					if (0xD800 <= charCode && charCode <= 0xDBFF)
					{
						i++;
						output++;
					}
					output +=3;
				}
				else if (charCode > 0x7F)
					output +=2;
				else
					output++;
			}
			return output;
		}

		/**
	 * Takes a String and writes it into an array as UTF8 encoded bytes.
	 * @private
	 */
		function stringToUTF8(input, output, start) {
			var pos = start;
			for (var i = 0; i<input.length; i++) {
				var charCode = input.charCodeAt(i);

				// Check for a surrogate pair.
				if (0xD800 <= charCode && charCode <= 0xDBFF) {
					var lowCharCode = input.charCodeAt(++i);
					if (isNaN(lowCharCode)) {
						throw new Error(format(ERROR.MALFORMED_UNICODE, [charCode, lowCharCode]));
					}
					charCode = ((charCode - 0xD800)<<10) + (lowCharCode - 0xDC00) + 0x10000;

				}

				if (charCode <= 0x7F) {
					output[pos++] = charCode;
				} else if (charCode <= 0x7FF) {
					output[pos++] = charCode>>6  & 0x1F | 0xC0;
					output[pos++] = charCode     & 0x3F | 0x80;
				} else if (charCode <= 0xFFFF) {
					output[pos++] = charCode>>12 & 0x0F | 0xE0;
					output[pos++] = charCode>>6  & 0x3F | 0x80;
					output[pos++] = charCode     & 0x3F | 0x80;
				} else {
					output[pos++] = charCode>>18 & 0x07 | 0xF0;
					output[pos++] = charCode>>12 & 0x3F | 0x80;
					output[pos++] = charCode>>6  & 0x3F | 0x80;
					output[pos++] = charCode     & 0x3F | 0x80;
				}
			}
			return output;
		}

		function parseUTF8(input, offset, length) {
			var output = "";
			var utf16;
			var pos = offset;

			while (pos < offset+length)
			{
				var byte1 = input[pos++];
				if (byte1 < 128)
					utf16 = byte1;
				else
				{
					var byte2 = input[pos++]-128;
					if (byte2 < 0)
						throw new Error(format(ERROR.MALFORMED_UTF, [byte1.toString(16), byte2.toString(16),""]));
					if (byte1 < 0xE0)             // 2 byte character
						utf16 = 64*(byte1-0xC0) + byte2;
					else
					{
						var byte3 = input[pos++]-128;
						if (byte3 < 0)
							throw new Error(format(ERROR.MALFORMED_UTF, [byte1.toString(16), byte2.toString(16), byte3.toString(16)]));
						if (byte1 < 0xF0)        // 3 byte character
							utf16 = 4096*(byte1-0xE0) + 64*byte2 + byte3;
						else
						{
							var byte4 = input[pos++]-128;
							if (byte4 < 0)
								throw new Error(format(ERROR.MALFORMED_UTF, [byte1.toString(16), byte2.toString(16), byte3.toString(16), byte4.toString(16)]));
							if (byte1 < 0xF8)        // 4 byte character
								utf16 = 262144*(byte1-0xF0) + 4096*byte2 + 64*byte3 + byte4;
							else                     // longer encodings are not supported
								throw new Error(format(ERROR.MALFORMED_UTF, [byte1.toString(16), byte2.toString(16), byte3.toString(16), byte4.toString(16)]));
						}
					}
				}

				if (utf16 > 0xFFFF)   // 4 byte character - express as a surrogate pair
				{
					utf16 -= 0x10000;
					output += String.fromCharCode(0xD800 + (utf16 >> 10)); // lead character
					utf16 = 0xDC00 + (utf16 & 0x3FF);  // trail character
				}
				output += String.fromCharCode(utf16);
			}
			return output;
		}

		/**
	 * Repeat keepalive requests, monitor responses.
	 * @ignore
	 */
		var Pinger = function(client, keepAliveInterval) {
			this._client = client;
			this._keepAliveInterval = keepAliveInterval*1000;
			this.isReset = false;

			var pingReq = new WireMessage(MESSAGE_TYPE.PINGREQ).encode();

			var doTimeout = function (pinger) {
				return function () {
					return doPing.apply(pinger);
				};
			};

			/** @ignore */
			var doPing = function() {
				if (!this.isReset) {
					this._client._trace("Pinger.doPing", "Timed out");
					this._client._disconnected( ERROR.PING_TIMEOUT.code , format(ERROR.PING_TIMEOUT));
				} else {
					this.isReset = false;
					this._client._trace("Pinger.doPing", "send PINGREQ");
					this._client.socket.send(pingReq);
					this.timeout = setTimeout(doTimeout(this), this._keepAliveInterval);
				}
			};

			this.reset = function() {
				this.isReset = true;
				clearTimeout(this.timeout);
				if (this._keepAliveInterval > 0)
					this.timeout = setTimeout(doTimeout(this), this._keepAliveInterval);
			};

			this.cancel = function() {
				clearTimeout(this.timeout);
			};
		};

		/**
	 * Monitor request completion.
	 * @ignore
	 */
		var Timeout = function(client, timeoutSeconds, action, args) {
			if (!timeoutSeconds)
				timeoutSeconds = 30;

			var doTimeout = function (action, client, args) {
				return function () {
					return action.apply(client, args);
				};
			};
			this.timeout = setTimeout(doTimeout(action, client, args), timeoutSeconds * 1000);

			this.cancel = function() {
				clearTimeout(this.timeout);
			};
		};

	/**
	 * Internal implementation of the Websockets MQTT V3.1 client.
	 *
	 * @name Paho.ClientImpl @constructor
	 * @param {String} host the DNS nameof the webSocket host.
	 * @param {Number} port the port number for that host.
	 * @param {String} clientId the MQ client identifier.
	 */
		var ClientImpl = function (uri, host, port, path, clientId) {
		// Check dependencies are satisfied in this browser.
			if (!("WebSocket" in global && global.WebSocket !== null)) {
				throw new Error(format(ERROR.UNSUPPORTED, ["WebSocket"]));
			}
			if (!("ArrayBuffer" in global && global.ArrayBuffer !== null)) {
				throw new Error(format(ERROR.UNSUPPORTED, ["ArrayBuffer"]));
			}
			this._trace("Paho.Client", uri, host, port, path, clientId);

			this.host = host;
			this.port = port;
			this.path = path;
			this.uri = uri;
			this.clientId = clientId;
			this._wsuri = null;

			// Local storagekeys are qualified with the following string.
			// The conditional inclusion of path in the key is for backward
			// compatibility to when the path was not configurable and assumed to
			// be /mqtt
			this._localKey=host+":"+port+(path!="/mqtt"?":"+path:"")+":"+clientId+":";

			// Create private instance-only message queue
			// Internal queue of messages to be sent, in sending order.
			this._msg_queue = [];
			this._buffered_msg_queue = [];

			// Messages we have sent and are expecting a response for, indexed by their respective message ids.
			this._sentMessages = {};

			// Messages we have received and acknowleged and are expecting a confirm message for
			// indexed by their respective message ids.
			this._receivedMessages = {};

			// Internal list of callbacks to be executed when messages
			// have been successfully sent over web socket, e.g. disconnect
			// when it doesn't have to wait for ACK, just message is dispatched.
			this._notify_msg_sent = {};

			// Unique identifier for SEND messages, incrementing
			// counter as messages are sent.
			this._message_identifier = 1;

			// Used to determine the transmission sequence of stored sent messages.
			this._sequence = 0;


			// Load the local state, if any, from the saved version, only restore state relevant to this client.
			for (var key in localStorage)
				if (   key.indexOf("Sent:"+this._localKey) === 0 || key.indexOf("Received:"+this._localKey) === 0)
					this.restore(key);
		};

		// Messaging Client public instance members.
		ClientImpl.prototype.host = null;
		ClientImpl.prototype.port = null;
		ClientImpl.prototype.path = null;
		ClientImpl.prototype.uri = null;
		ClientImpl.prototype.clientId = null;

		// Messaging Client private instance members.
		ClientImpl.prototype.socket = null;
		/* true once we have received an acknowledgement to a CONNECT packet. */
		ClientImpl.prototype.connected = false;
		/* The largest message identifier allowed, may not be larger than 2**16 but
		 * if set smaller reduces the maximum number of outbound messages allowed.
		 */
		ClientImpl.prototype.maxMessageIdentifier = 65536;
		ClientImpl.prototype.connectOptions = null;
		ClientImpl.prototype.hostIndex = null;
		ClientImpl.prototype.onConnected = null;
		ClientImpl.prototype.onConnectionLost = null;
		ClientImpl.prototype.onMessageDelivered = null;
		ClientImpl.prototype.onMessageArrived = null;
		ClientImpl.prototype.traceFunction = null;
		ClientImpl.prototype._msg_queue = null;
		ClientImpl.prototype._buffered_msg_queue = null;
		ClientImpl.prototype._connectTimeout = null;
		/* The sendPinger monitors how long we allow before we send data to prove to the server that we are alive. */
		ClientImpl.prototype.sendPinger = null;
		/* The receivePinger monitors how long we allow before we require evidence that the server is alive. */
		ClientImpl.prototype.receivePinger = null;
		ClientImpl.prototype._reconnectInterval = 1; // Reconnect Delay, starts at 1 second
		ClientImpl.prototype._reconnecting = false;
		ClientImpl.prototype._reconnectTimeout = null;
		ClientImpl.prototype.disconnectedPublishing = false;
		ClientImpl.prototype.disconnectedBufferSize = 5000;

		ClientImpl.prototype.receiveBuffer = null;

		ClientImpl.prototype._traceBuffer = null;
		ClientImpl.prototype._MAX_TRACE_ENTRIES = 100;

		ClientImpl.prototype.connect = function (connectOptions) {
			var connectOptionsMasked = this._traceMask(connectOptions, "password");
			this._trace("Client.connect", connectOptionsMasked, this.socket, this.connected);

			if (this.connected)
				throw new Error(format(ERROR.INVALID_STATE, ["already connected"]));
			if (this.socket)
				throw new Error(format(ERROR.INVALID_STATE, ["already connected"]));

			if (this._reconnecting) {
			// connect() function is called while reconnect is in progress.
			// Terminate the auto reconnect process to use new connect options.
				this._reconnectTimeout.cancel();
				this._reconnectTimeout = null;
				this._reconnecting = false;
			}

			this.connectOptions = connectOptions;
			this._reconnectInterval = 1;
			this._reconnecting = false;
			if (connectOptions.uris) {
				this.hostIndex = 0;
				this._doConnect(connectOptions.uris[0]);
			} else {
				this._doConnect(this.uri);
			}

		};

		ClientImpl.prototype.subscribe = function (filter, subscribeOptions) {
			this._trace("Client.subscribe", filter, subscribeOptions);

			if (!this.connected)
				throw new Error(format(ERROR.INVALID_STATE, ["not connected"]));

            var wireMessage = new WireMessage(MESSAGE_TYPE.SUBSCRIBE);
            wireMessage.topics = filter.constructor === Array ? filter : [filter];
            if (subscribeOptions.qos === undefined)
                subscribeOptions.qos = 0;
            wireMessage.requestedQos = [];
            for (var i = 0; i < wireMessage.topics.length; i++)
                wireMessage.requestedQos[i] = subscribeOptions.qos;

			if (subscribeOptions.onSuccess) {
				wireMessage.onSuccess = function(grantedQos) {subscribeOptions.onSuccess({invocationContext:subscribeOptions.invocationContext,grantedQos:grantedQos});};
			}

			if (subscribeOptions.onFailure) {
				wireMessage.onFailure = function(errorCode) {subscribeOptions.onFailure({invocationContext:subscribeOptions.invocationContext,errorCode:errorCode, errorMessage:format(errorCode)});};
			}

			if (subscribeOptions.timeout) {
				wireMessage.timeOut = new Timeout(this, subscribeOptions.timeout, subscribeOptions.onFailure,
					[{invocationContext:subscribeOptions.invocationContext,
						errorCode:ERROR.SUBSCRIBE_TIMEOUT.code,
						errorMessage:format(ERROR.SUBSCRIBE_TIMEOUT)}]);
			}

			// All subscriptions return a SUBACK.
			this._requires_ack(wireMessage);
			this._schedule_message(wireMessage);
		};

		/** @ignore */
		ClientImpl.prototype.unsubscribe = function(filter, unsubscribeOptions) {
			this._trace("Client.unsubscribe", filter, unsubscribeOptions);

			if (!this.connected)
				throw new Error(format(ERROR.INVALID_STATE, ["not connected"]));

            var wireMessage = new WireMessage(MESSAGE_TYPE.UNSUBSCRIBE);
            wireMessage.topics = filter.constructor === Array ? filter : [filter];

			if (unsubscribeOptions.onSuccess) {
				wireMessage.callback = function() {unsubscribeOptions.onSuccess({invocationContext:unsubscribeOptions.invocationContext});};
			}
			if (unsubscribeOptions.timeout) {
				wireMessage.timeOut = new Timeout(this, unsubscribeOptions.timeout, unsubscribeOptions.onFailure,
					[{invocationContext:unsubscribeOptions.invocationContext,
						errorCode:ERROR.UNSUBSCRIBE_TIMEOUT.code,
						errorMessage:format(ERROR.UNSUBSCRIBE_TIMEOUT)}]);
			}

			// All unsubscribes return a SUBACK.
			this._requires_ack(wireMessage);
			this._schedule_message(wireMessage);
		};

		ClientImpl.prototype.send = function (message) {
			this._trace("Client.send", message);

			var wireMessage = new WireMessage(MESSAGE_TYPE.PUBLISH);
			wireMessage.payloadMessage = message;

			if (this.connected) {
			// Mark qos 1 & 2 message as "ACK required"
			// For qos 0 message, invoke onMessageDelivered callback if there is one.
			// Then schedule the message.
				if (message.qos > 0) {
					this._requires_ack(wireMessage);
				} else if (this.onMessageDelivered) {
					this._notify_msg_sent[wireMessage] = this.onMessageDelivered(wireMessage.payloadMessage);
				}
				this._schedule_message(wireMessage);
			} else {
			// Currently disconnected, will not schedule this message
			// Check if reconnecting is in progress and disconnected publish is enabled.
				if (this._reconnecting && this.disconnectedPublishing) {
				// Check the limit which include the "required ACK" messages
					var messageCount = Object.keys(this._sentMessages).length + this._buffered_msg_queue.length;
					if (messageCount > this.disconnectedBufferSize) {
						throw new Error(format(ERROR.BUFFER_FULL, [this.disconnectedBufferSize]));
					} else {
						if (message.qos > 0) {
						// Mark this message as "ACK required"
							this._requires_ack(wireMessage);
						} else {
							wireMessage.sequence = ++this._sequence;
							// Add messages in fifo order to array, by adding to start
							this._buffered_msg_queue.unshift(wireMessage);
						}
					}
				} else {
					throw new Error(format(ERROR.INVALID_STATE, ["not connected"]));
				}
			}
		};

		ClientImpl.prototype.disconnect = function () {
			this._trace("Client.disconnect");

			if (this._reconnecting) {
			// disconnect() function is called while reconnect is in progress.
			// Terminate the auto reconnect process.
				this._reconnectTimeout.cancel();
				this._reconnectTimeout = null;
				this._reconnecting = false;
			}

			if (!this.socket)
				throw new Error(format(ERROR.INVALID_STATE, ["not connecting or connected"]));

			var wireMessage = new WireMessage(MESSAGE_TYPE.DISCONNECT);

			// Run the disconnected call back as soon as the message has been sent,
			// in case of a failure later on in the disconnect processing.
			// as a consequence, the _disconected call back may be run several times.
			this._notify_msg_sent[wireMessage] = scope(this._disconnected, this);

			this._schedule_message(wireMessage);
		};

		ClientImpl.prototype.getTraceLog = function () {
			if ( this._traceBuffer !== null ) {
				this._trace("Client.getTraceLog", new Date());
				this._trace("Client.getTraceLog in flight messages", this._sentMessages.length);
				for (var key in this._sentMessages)
					this._trace("_sentMessages ",key, this._sentMessages[key]);
				for (var key in this._receivedMessages)
					this._trace("_receivedMessages ",key, this._receivedMessages[key]);

				return this._traceBuffer;
			}
		};

		ClientImpl.prototype.startTrace = function () {
			if ( this._traceBuffer === null ) {
				this._traceBuffer = [];
			}
			this._trace("Client.startTrace", new Date(), version);
		};

		ClientImpl.prototype.stopTrace = function () {
			delete this._traceBuffer;
		};

		ClientImpl.prototype._doConnect = function (wsurl) {
		// When the socket is open, this client will send the CONNECT WireMessage using the saved parameters.
			if (this.connectOptions.useSSL) {
				var uriParts = wsurl.split(":");
				uriParts[0] = "wss";
				wsurl = uriParts.join(":");
			}
			this._wsuri = wsurl;
			this.connected = false;



			if (this.connectOptions.mqttVersion < 4) {
				this.socket = new WebSocket(wsurl, ["mqttv3.1"]);
			} else {
				this.socket = new WebSocket(wsurl, ["mqtt"]);
			}
			this.socket.binaryType = "arraybuffer";
			this.socket.onopen = scope(this._on_socket_open, this);
			this.socket.onmessage = scope(this._on_socket_message, this);
			this.socket.onerror = scope(this._on_socket_error, this);
			this.socket.onclose = scope(this._on_socket_close, this);

			this.sendPinger = new Pinger(this, this.connectOptions.keepAliveInterval);
			this.receivePinger = new Pinger(this, this.connectOptions.keepAliveInterval);
			if (this._connectTimeout) {
				this._connectTimeout.cancel();
				this._connectTimeout = null;
			}
			this._connectTimeout = new Timeout(this, this.connectOptions.timeout, this._disconnected,  [ERROR.CONNECT_TIMEOUT.code, format(ERROR.CONNECT_TIMEOUT)]);
		};


		// Schedule a new message to be sent over the WebSockets
		// connection. CONNECT messages cause WebSocket connection
		// to be started. All other messages are queued internally
		// until this has happened. When WS connection starts, process
		// all outstanding messages.
		ClientImpl.prototype._schedule_message = function (message) {
			// Add messages in fifo order to array, by adding to start
			this._msg_queue.unshift(message);
			// Process outstanding messages in the queue if we have an  open socket, and have received CONNACK.
			if (this.connected) {
				this._process_queue();
			}
		};

		ClientImpl.prototype.store = function(prefix, wireMessage) {
			var storedMessage = {type:wireMessage.type, messageIdentifier:wireMessage.messageIdentifier, version:1};

			switch(wireMessage.type) {
			case MESSAGE_TYPE.PUBLISH:
				if(wireMessage.pubRecReceived)
					storedMessage.pubRecReceived = true;

				// Convert the payload to a hex string.
				storedMessage.payloadMessage = {};
				var hex = "";
				var messageBytes = wireMessage.payloadMessage.payloadBytes;
				for (var i=0; i<messageBytes.length; i++) {
					if (messageBytes[i] <= 0xF)
						hex = hex+"0"+messageBytes[i].toString(16);
					else
						hex = hex+messageBytes[i].toString(16);
				}
				storedMessage.payloadMessage.payloadHex = hex;

				storedMessage.payloadMessage.qos = wireMessage.payloadMessage.qos;
				storedMessage.payloadMessage.destinationName = wireMessage.payloadMessage.destinationName;
				if (wireMessage.payloadMessage.duplicate)
					storedMessage.payloadMessage.duplicate = true;
				if (wireMessage.payloadMessage.retained)
					storedMessage.payloadMessage.retained = true;

				// Add a sequence number to sent messages.
				if ( prefix.indexOf("Sent:") === 0 ) {
					if ( wireMessage.sequence === undefined )
						wireMessage.sequence = ++this._sequence;
					storedMessage.sequence = wireMessage.sequence;
				}
				break;

			default:
				throw Error(format(ERROR.INVALID_STORED_DATA, [prefix+this._localKey+wireMessage.messageIdentifier, storedMessage]));
			}
			localStorage.setItem(prefix+this._localKey+wireMessage.messageIdentifier, JSON.stringify(storedMessage));
		};

		ClientImpl.prototype.restore = function(key) {
			var value = localStorage.getItem(key);
			var storedMessage = JSON.parse(value);

			var wireMessage = new WireMessage(storedMessage.type, storedMessage);

			switch(storedMessage.type) {
			case MESSAGE_TYPE.PUBLISH:
				// Replace the payload message with a Message object.
				var hex = storedMessage.payloadMessage.payloadHex;
				var buffer = new ArrayBuffer((hex.length)/2);
				var byteStream = new Uint8Array(buffer);
				var i = 0;
				while (hex.length >= 2) {
					var x = parseInt(hex.substring(0, 2), 16);
					hex = hex.substring(2, hex.length);
					byteStream[i++] = x;
				}
				var payloadMessage = new Message(byteStream);

				payloadMessage.qos = storedMessage.payloadMessage.qos;
				payloadMessage.destinationName = storedMessage.payloadMessage.destinationName;
				if (storedMessage.payloadMessage.duplicate)
					payloadMessage.duplicate = true;
				if (storedMessage.payloadMessage.retained)
					payloadMessage.retained = true;
				wireMessage.payloadMessage = payloadMessage;

				break;

			default:
				throw Error(format(ERROR.INVALID_STORED_DATA, [key, value]));
			}

			if (key.indexOf("Sent:"+this._localKey) === 0) {
				wireMessage.payloadMessage.duplicate = true;
				this._sentMessages[wireMessage.messageIdentifier] = wireMessage;
			} else if (key.indexOf("Received:"+this._localKey) === 0) {
				this._receivedMessages[wireMessage.messageIdentifier] = wireMessage;
			}
		};

		ClientImpl.prototype._process_queue = function () {
			var message = null;

			// Send all queued messages down socket connection
			while ((message = this._msg_queue.pop())) {
				this._socket_send(message);
				// Notify listeners that message was successfully sent
				if (this._notify_msg_sent[message]) {
					this._notify_msg_sent[message]();
					delete this._notify_msg_sent[message];
				}
			}
		};

		/**
	 * Expect an ACK response for this message. Add message to the set of in progress
	 * messages and set an unused identifier in this message.
	 * @ignore
	 */
		ClientImpl.prototype._requires_ack = function (wireMessage) {
			var messageCount = Object.keys(this._sentMessages).length;
			if (messageCount > this.maxMessageIdentifier)
				throw Error ("Too many messages:"+messageCount);

			while(this._sentMessages[this._message_identifier] !== undefined) {
				this._message_identifier++;
			}
			wireMessage.messageIdentifier = this._message_identifier;
			this._sentMessages[wireMessage.messageIdentifier] = wireMessage;
			if (wireMessage.type === MESSAGE_TYPE.PUBLISH) {
				this.store("Sent:", wireMessage);
			}
			if (this._message_identifier === this.maxMessageIdentifier) {
				this._message_identifier = 1;
			}
		};

		/**
	 * Called when the underlying websocket has been opened.
	 * @ignore
	 */
		ClientImpl.prototype._on_socket_open = function () {
		// Create the CONNECT message object.
			var wireMessage = new WireMessage(MESSAGE_TYPE.CONNECT, this.connectOptions);
			wireMessage.clientId = this.clientId;
			this._socket_send(wireMessage);
		};

		/**
	 * Called when the underlying websocket has received a complete packet.
	 * @ignore
	 */
		ClientImpl.prototype._on_socket_message = function (event) {
			this._trace("Client._on_socket_message", event.data);
			var messages = this._deframeMessages(event.data);
			for (var i = 0; i < messages.length; i+=1) {
				this._handleMessage(messages[i]);
			}
		};

		ClientImpl.prototype._deframeMessages = function(data) {
			var byteArray = new Uint8Array(data);
			var messages = [];
			if (this.receiveBuffer) {
				var newData = new Uint8Array(this.receiveBuffer.length+byteArray.length);
				newData.set(this.receiveBuffer);
				newData.set(byteArray,this.receiveBuffer.length);
				byteArray = newData;
				delete this.receiveBuffer;
			}
			try {
				var offset = 0;
				while(offset < byteArray.length) {
					var result = decodeMessage(byteArray,offset);
					var wireMessage = result[0];
					offset = result[1];
					if (wireMessage !== null) {
						messages.push(wireMessage);
					} else {
						break;
					}
				}
				if (offset < byteArray.length) {
					this.receiveBuffer = byteArray.subarray(offset);
				}
			} catch (error) {
				var errorStack = ((error.hasOwnProperty("stack") == "undefined") ? error.stack.toString() : "No Error Stack Available");
				this._disconnected(ERROR.INTERNAL_ERROR.code , format(ERROR.INTERNAL_ERROR, [error.message,errorStack]));
				return;
			}
			return messages;
		};

		ClientImpl.prototype._handleMessage = function(wireMessage) {

			this._trace("Client._handleMessage", wireMessage);

			try {
				switch(wireMessage.type) {
				case MESSAGE_TYPE.CONNACK:
					this._connectTimeout.cancel();
					if (this._reconnectTimeout)
						this._reconnectTimeout.cancel();

					// If we have started using clean session then clear up the local state.
					if (this.connectOptions.cleanSession) {
						for (var key in this._sentMessages) {
							var sentMessage = this._sentMessages[key];
							localStorage.removeItem("Sent:"+this._localKey+sentMessage.messageIdentifier);
						}
						this._sentMessages = {};

						for (var key in this._receivedMessages) {
							var receivedMessage = this._receivedMessages[key];
							localStorage.removeItem("Received:"+this._localKey+receivedMessage.messageIdentifier);
						}
						this._receivedMessages = {};
					}
					// Client connected and ready for business.
					if (wireMessage.returnCode === 0) {

						this.connected = true;
						// Jump to the end of the list of uris and stop looking for a good host.

						if (this.connectOptions.uris)
							this.hostIndex = this.connectOptions.uris.length;

					} else {
						this._disconnected(ERROR.CONNACK_RETURNCODE.code , format(ERROR.CONNACK_RETURNCODE, [wireMessage.returnCode, CONNACK_RC[wireMessage.returnCode]]));
						break;
					}

					// Resend messages.
					var sequencedMessages = [];
					for (var msgId in this._sentMessages) {
						if (this._sentMessages.hasOwnProperty(msgId))
							sequencedMessages.push(this._sentMessages[msgId]);
					}

					// Also schedule qos 0 buffered messages if any
					if (this._buffered_msg_queue.length > 0) {
						var msg = null;
						while ((msg = this._buffered_msg_queue.pop())) {
							sequencedMessages.push(msg);
							if (this.onMessageDelivered)
								this._notify_msg_sent[msg] = this.onMessageDelivered(msg.payloadMessage);
						}
					}

					// Sort sentMessages into the original sent order.
					var sequencedMessages = sequencedMessages.sort(function(a,b) {return a.sequence - b.sequence;} );
					for (var i=0, len=sequencedMessages.length; i<len; i++) {
						var sentMessage = sequencedMessages[i];
						if (sentMessage.type == MESSAGE_TYPE.PUBLISH && sentMessage.pubRecReceived) {
							var pubRelMessage = new WireMessage(MESSAGE_TYPE.PUBREL, {messageIdentifier:sentMessage.messageIdentifier});
							this._schedule_message(pubRelMessage);
						} else {
							this._schedule_message(sentMessage);
						}
					}

					// Execute the connectOptions.onSuccess callback if there is one.
					// Will also now return if this connection was the result of an automatic
					// reconnect and which URI was successfully connected to.
					if (this.connectOptions.onSuccess) {
						this.connectOptions.onSuccess({invocationContext:this.connectOptions.invocationContext});
					}

					var reconnected = false;
					if (this._reconnecting) {
						reconnected = true;
						this._reconnectInterval = 1;
						this._reconnecting = false;
					}

					// Execute the onConnected callback if there is one.
					this._connected(reconnected, this._wsuri);

					// Process all queued messages now that the connection is established.
					this._process_queue();
					break;

				case MESSAGE_TYPE.PUBLISH:
					this._receivePublish(wireMessage);
					break;

				case MESSAGE_TYPE.PUBACK:
					var sentMessage = this._sentMessages[wireMessage.messageIdentifier];
					// If this is a re flow of a PUBACK after we have restarted receivedMessage will not exist.
					if (sentMessage) {
						delete this._sentMessages[wireMessage.messageIdentifier];
						localStorage.removeItem("Sent:"+this._localKey+wireMessage.messageIdentifier);
						if (this.onMessageDelivered)
							this.onMessageDelivered(sentMessage.payloadMessage);
					}
					break;

				case MESSAGE_TYPE.PUBREC:
					var sentMessage = this._sentMessages[wireMessage.messageIdentifier];
					// If this is a re flow of a PUBREC after we have restarted receivedMessage will not exist.
					if (sentMessage) {
						sentMessage.pubRecReceived = true;
						var pubRelMessage = new WireMessage(MESSAGE_TYPE.PUBREL, {messageIdentifier:wireMessage.messageIdentifier});
						this.store("Sent:", sentMessage);
						this._schedule_message(pubRelMessage);
					}
					break;

				case MESSAGE_TYPE.PUBREL:
					var receivedMessage = this._receivedMessages[wireMessage.messageIdentifier];
					localStorage.removeItem("Received:"+this._localKey+wireMessage.messageIdentifier);
					// If this is a re flow of a PUBREL after we have restarted receivedMessage will not exist.
					if (receivedMessage) {
						this._receiveMessage(receivedMessage);
						delete this._receivedMessages[wireMessage.messageIdentifier];
					}
					// Always flow PubComp, we may have previously flowed PubComp but the server lost it and restarted.
					var pubCompMessage = new WireMessage(MESSAGE_TYPE.PUBCOMP, {messageIdentifier:wireMessage.messageIdentifier});
					this._schedule_message(pubCompMessage);


					break;

				case MESSAGE_TYPE.PUBCOMP:
					var sentMessage = this._sentMessages[wireMessage.messageIdentifier];
					delete this._sentMessages[wireMessage.messageIdentifier];
					localStorage.removeItem("Sent:"+this._localKey+wireMessage.messageIdentifier);
					if (this.onMessageDelivered)
						this.onMessageDelivered(sentMessage.payloadMessage);
					break;

				case MESSAGE_TYPE.SUBACK:
					var sentMessage = this._sentMessages[wireMessage.messageIdentifier];
					if (sentMessage) {
						if(sentMessage.timeOut)
							sentMessage.timeOut.cancel();
						// This will need to be fixed when we add multiple topic support
						if (wireMessage.returnCode[0] === 0x80) {
							if (sentMessage.onFailure) {
								sentMessage.onFailure(wireMessage.returnCode);
							}
						} else if (sentMessage.onSuccess) {
							sentMessage.onSuccess(wireMessage.returnCode);
						}
						delete this._sentMessages[wireMessage.messageIdentifier];
					}
					break;

				case MESSAGE_TYPE.UNSUBACK:
					var sentMessage = this._sentMessages[wireMessage.messageIdentifier];
					if (sentMessage) {
						if (sentMessage.timeOut)
							sentMessage.timeOut.cancel();
						if (sentMessage.callback) {
							sentMessage.callback();
						}
						delete this._sentMessages[wireMessage.messageIdentifier];
					}

					break;

				case MESSAGE_TYPE.PINGRESP:
				/* The sendPinger or receivePinger may have sent a ping, the receivePinger has already been reset. */
					this.sendPinger.reset();
					break;

				case MESSAGE_TYPE.DISCONNECT:
				// Clients do not expect to receive disconnect packets.
					this._disconnected(ERROR.INVALID_MQTT_MESSAGE_TYPE.code , format(ERROR.INVALID_MQTT_MESSAGE_TYPE, [wireMessage.type]));
					break;

				default:
					this._disconnected(ERROR.INVALID_MQTT_MESSAGE_TYPE.code , format(ERROR.INVALID_MQTT_MESSAGE_TYPE, [wireMessage.type]));
				}
			} catch (error) {
				var errorStack = ((error.hasOwnProperty("stack") == "undefined") ? error.stack.toString() : "No Error Stack Available");
				this._disconnected(ERROR.INTERNAL_ERROR.code , format(ERROR.INTERNAL_ERROR, [error.message,errorStack]));
				return;
			}
		};

		/** @ignore */
		ClientImpl.prototype._on_socket_error = function (error) {
			if (!this._reconnecting) {
				this._disconnected(ERROR.SOCKET_ERROR.code , format(ERROR.SOCKET_ERROR, [error.data]));
			}
		};

		/** @ignore */
		ClientImpl.prototype._on_socket_close = function () {
			if (!this._reconnecting) {
				this._disconnected(ERROR.SOCKET_CLOSE.code , format(ERROR.SOCKET_CLOSE));
			}
		};

		/** @ignore */
		ClientImpl.prototype._socket_send = function (wireMessage) {

			if (wireMessage.type == 1) {
				var wireMessageMasked = this._traceMask(wireMessage, "password");
				this._trace("Client._socket_send", wireMessageMasked);
			}
			else this._trace("Client._socket_send", wireMessage);

			this.socket.send(wireMessage.encode());
			/* We have proved to the server we are alive. */
			this.sendPinger.reset();
		};

		/** @ignore */
		ClientImpl.prototype._receivePublish = function (wireMessage) {
			switch(wireMessage.payloadMessage.qos) {
			case "undefined":
			case 0:
				this._receiveMessage(wireMessage);
				break;

			case 1:
				var pubAckMessage = new WireMessage(MESSAGE_TYPE.PUBACK, {messageIdentifier:wireMessage.messageIdentifier});
				this._schedule_message(pubAckMessage);
				this._receiveMessage(wireMessage);
				break;

			case 2:
				this._receivedMessages[wireMessage.messageIdentifier] = wireMessage;
				this.store("Received:", wireMessage);
				var pubRecMessage = new WireMessage(MESSAGE_TYPE.PUBREC, {messageIdentifier:wireMessage.messageIdentifier});
				this._schedule_message(pubRecMessage);

				break;

			default:
				throw Error("Invaild qos=" + wireMessage.payloadMessage.qos);
			}
		};

		/** @ignore */
		ClientImpl.prototype._receiveMessage = function (wireMessage) {
			if (this.onMessageArrived) {
				this.onMessageArrived(wireMessage.payloadMessage);
			}
		};

		/**
	 * Client has connected.
	 * @param {reconnect} [boolean] indicate if this was a result of reconnect operation.
	 * @param {uri} [string] fully qualified WebSocket URI of the server.
	 */
		ClientImpl.prototype._connected = function (reconnect, uri) {
		// Execute the onConnected callback if there is one.
			if (this.onConnected)
				this.onConnected(reconnect, uri);
		};

		/**
	 * Attempts to reconnect the client to the server.
   * For each reconnect attempt, will double the reconnect interval
   * up to 128 seconds.
	 */
		ClientImpl.prototype._reconnect = function () {
			this._trace("Client._reconnect");
			if (!this.connected) {
				this._reconnecting = true;
				this.sendPinger.cancel();
				this.receivePinger.cancel();
				if (this._reconnectInterval < 128)
					this._reconnectInterval = this._reconnectInterval * 2;
				if (this.connectOptions.uris) {
					this.hostIndex = 0;
					this._doConnect(this.connectOptions.uris[0]);
				} else {
					this._doConnect(this.uri);
				}
			}
		};

		/**
	 * Client has disconnected either at its own request or because the server
	 * or network disconnected it. Remove all non-durable state.
	 * @param {errorCode} [number] the error number.
	 * @param {errorText} [string] the error text.
	 * @ignore
	 */
		ClientImpl.prototype._disconnected = function (errorCode, errorText) {
			this._trace("Client._disconnected", errorCode, errorText);

			if (errorCode !== undefined && this._reconnecting) {
				//Continue automatic reconnect process
				this._reconnectTimeout = new Timeout(this, this._reconnectInterval, this._reconnect);
				return;
			}

			this.sendPinger.cancel();
			this.receivePinger.cancel();
			if (this._connectTimeout) {
				this._connectTimeout.cancel();
				this._connectTimeout = null;
			}

			// Clear message buffers.
			this._msg_queue = [];
			this._buffered_msg_queue = [];
			this._notify_msg_sent = {};

			if (this.socket) {
			// Cancel all socket callbacks so that they cannot be driven again by this socket.
				this.socket.onopen = null;
				this.socket.onmessage = null;
				this.socket.onerror = null;
				this.socket.onclose = null;
				if (this.socket.readyState === 1)
					this.socket.close();
				delete this.socket;
			}

			if (this.connectOptions.uris && this.hostIndex < this.connectOptions.uris.length-1) {
			// Try the next host.
				this.hostIndex++;
				this._doConnect(this.connectOptions.uris[this.hostIndex]);
			} else {

				if (errorCode === undefined) {
					errorCode = ERROR.OK.code;
					errorText = format(ERROR.OK);
				}

				// Run any application callbacks last as they may attempt to reconnect and hence create a new socket.
				if (this.connected) {
					this.connected = false;
					// Execute the connectionLostCallback if there is one, and we were connected.
					if (this.onConnectionLost) {
						this.onConnectionLost({errorCode:errorCode, errorMessage:errorText, reconnect:this.connectOptions.reconnect, uri:this._wsuri});
					}
					if (errorCode !== ERROR.OK.code && this.connectOptions.reconnect) {
					// Start automatic reconnect process for the very first time since last successful connect.
						this._reconnectInterval = 1;
						this._reconnect();
						return;
					}
				} else {
				// Otherwise we never had a connection, so indicate that the connect has failed.
					if (this.connectOptions.mqttVersion === 4 && this.connectOptions.mqttVersionExplicit === false) {
						this._trace("Failed to connect V4, dropping back to V3");
						this.connectOptions.mqttVersion = 3;
						if (this.connectOptions.uris) {
							this.hostIndex = 0;
							this._doConnect(this.connectOptions.uris[0]);
						} else {
							this._doConnect(this.uri);
						}
					} else if(this.connectOptions.onFailure) {
						this.connectOptions.onFailure({invocationContext:this.connectOptions.invocationContext, errorCode:errorCode, errorMessage:errorText});
					}
				}
			}
		};

		/** @ignore */
		ClientImpl.prototype._trace = function () {
		// Pass trace message back to client's callback function
			if (this.traceFunction) {
				var args = Array.prototype.slice.call(arguments);
				for (var i in args)
				{
					if (typeof args[i] !== "undefined")
						args.splice(i, 1, JSON.stringify(args[i]));
				}
				var record = args.join("");
				this.traceFunction ({severity: "Debug", message: record	});
			}

			//buffer style trace
			if ( this._traceBuffer !== null ) {
				for (var i = 0, max = arguments.length; i < max; i++) {
					if ( this._traceBuffer.length == this._MAX_TRACE_ENTRIES ) {
						this._traceBuffer.shift();
					}
					if (i === 0) this._traceBuffer.push(arguments[i]);
					else if (typeof arguments[i] === "undefined" ) this._traceBuffer.push(arguments[i]);
					else this._traceBuffer.push("  "+JSON.stringify(arguments[i]));
				}
			}
		};

		/** @ignore */
		ClientImpl.prototype._traceMask = function (traceObject, masked) {
			var traceObjectMasked = {};
			for (var attr in traceObject) {
				if (traceObject.hasOwnProperty(attr)) {
					if (attr == masked)
						traceObjectMasked[attr] = "******";
					else
						traceObjectMasked[attr] = traceObject[attr];
				}
			}
			return traceObjectMasked;
		};

		// ------------------------------------------------------------------------
		// Public Programming interface.
		// ------------------------------------------------------------------------

		/**
	 * The JavaScript application communicates to the server using a {@link Paho.Client} object.
	 * <p>
	 * Most applications will create just one Client object and then call its connect() method,
	 * however applications can create more than one Client object if they wish.
	 * In this case the combination of host, port and clientId attributes must be different for each Client object.
	 * <p>
	 * The send, subscribe and unsubscribe methods are implemented as asynchronous JavaScript methods
	 * (even though the underlying protocol exchange might be synchronous in nature).
	 * This means they signal their completion by calling back to the application,
	 * via Success or Failure callback functions provided by the application on the method in question.
	 * Such callbacks are called at most once per method invocation and do not persist beyond the lifetime
	 * of the script that made the invocation.
	 * <p>
	 * In contrast there are some callback functions, most notably <i>onMessageArrived</i>,
	 * that are defined on the {@link Paho.Client} object.
	 * These may get called multiple times, and aren't directly related to specific method invocations made by the client.
	 *
	 * @name Paho.Client
	 *
	 * @constructor
	 *
	 * @param {string} host - the address of the messaging server, as a fully qualified WebSocket URI, as a DNS name or dotted decimal IP address.
	 * @param {number} port - the port number to connect to - only required if host is not a URI
	 * @param {string} path - the path on the host to connect to - only used if host is not a URI. Default: '/mqtt'.
	 * @param {string} clientId - the Messaging client identifier, between 1 and 23 characters in length.
	 *
	 * @property {string} host - <i>read only</i> the server's DNS hostname or dotted decimal IP address.
	 * @property {number} port - <i>read only</i> the server's port.
	 * @property {string} path - <i>read only</i> the server's path.
	 * @property {string} clientId - <i>read only</i> used when connecting to the server.
	 * @property {function} onConnectionLost - called when a connection has been lost.
	 *                            after a connect() method has succeeded.
	 *                            Establish the call back used when a connection has been lost. The connection may be
	 *                            lost because the client initiates a disconnect or because the server or network
	 *                            cause the client to be disconnected. The disconnect call back may be called without
	 *                            the connectionComplete call back being invoked if, for example the client fails to
	 *                            connect.
	 *                            A single response object parameter is passed to the onConnectionLost callback containing the following fields:
	 *                            <ol>
	 *                            <li>errorCode
	 *                            <li>errorMessage
	 *                            </ol>
	 * @property {function} onMessageDelivered - called when a message has been delivered.
	 *                            All processing that this Client will ever do has been completed. So, for example,
	 *                            in the case of a Qos=2 message sent by this client, the PubComp flow has been received from the server
	 *                            and the message has been removed from persistent storage before this callback is invoked.
	 *                            Parameters passed to the onMessageDelivered callback are:
	 *                            <ol>
	 *                            <li>{@link Paho.Message} that was delivered.
	 *                            </ol>
	 * @property {function} onMessageArrived - called when a message has arrived in this Paho.client.
	 *                            Parameters passed to the onMessageArrived callback are:
	 *                            <ol>
	 *                            <li>{@link Paho.Message} that has arrived.
	 *                            </ol>
	 * @property {function} onConnected - called when a connection is successfully made to the server.
	 *                                  after a connect() method.
	 *                                  Parameters passed to the onConnected callback are:
	 *                                  <ol>
	 *                                  <li>reconnect (boolean) - If true, the connection was the result of a reconnect.</li>
	 *                                  <li>URI (string) - The URI used to connect to the server.</li>
	 *                                  </ol>
	 * @property {boolean} disconnectedPublishing - if set, will enable disconnected publishing in
	 *                                            in the event that the connection to the server is lost.
	 * @property {number} disconnectedBufferSize - Used to set the maximum number of messages that the disconnected
	 *                                             buffer will hold before rejecting new messages. Default size: 5000 messages
	 * @property {function} trace - called whenever trace is called. TODO
	 */
		var Client = function (host, port, path, clientId) {

			var uri;

			if (typeof host !== "string")
				throw new Error(format(ERROR.INVALID_TYPE, [typeof host, "host"]));

			if (arguments.length == 2) {
			// host: must be full ws:// uri
			// port: clientId
				clientId = port;
				uri = host;
				var match = uri.match(/^(wss?):\/\/((\[(.+)\])|([^\/]+?))(:(\d+))?(\/.*)$/);
				if (match) {
					host = match[4]||match[2];
					port = parseInt(match[7]);
					path = match[8];
				} else {
					throw new Error(format(ERROR.INVALID_ARGUMENT,[host,"host"]));
				}
			} else {
				if (arguments.length == 3) {
					clientId = path;
					path = "/mqtt";
				}
				if (typeof port !== "number" || port < 0)
					throw new Error(format(ERROR.INVALID_TYPE, [typeof port, "port"]));
				if (typeof path !== "string")
					throw new Error(format(ERROR.INVALID_TYPE, [typeof path, "path"]));

				var ipv6AddSBracket = (host.indexOf(":") !== -1 && host.slice(0,1) !== "[" && host.slice(-1) !== "]");
				uri = "ws://"+(ipv6AddSBracket?"["+host+"]":host)+":"+port+path;
			}

			var clientIdLength = 0;
			for (var i = 0; i<clientId.length; i++) {
				var charCode = clientId.charCodeAt(i);
				if (0xD800 <= charCode && charCode <= 0xDBFF)  {
					i++; // Surrogate pair.
				}
				clientIdLength++;
			}
			if (typeof clientId !== "string" || clientIdLength > 65535)
				throw new Error(format(ERROR.INVALID_ARGUMENT, [clientId, "clientId"]));

			var client = new ClientImpl(uri, host, port, path, clientId);

			//Public Properties
			Object.defineProperties(this,{
				"host":{
					get: function() { return host; },
					set: function() { throw new Error(format(ERROR.UNSUPPORTED_OPERATION)); }
				},
				"port":{
					get: function() { return port; },
					set: function() { throw new Error(format(ERROR.UNSUPPORTED_OPERATION)); }
				},
				"path":{
					get: function() { return path; },
					set: function() { throw new Error(format(ERROR.UNSUPPORTED_OPERATION)); }
				},
				"uri":{
					get: function() { return uri; },
					set: function() { throw new Error(format(ERROR.UNSUPPORTED_OPERATION)); }
				},
				"clientId":{
					get: function() { return client.clientId; },
					set: function() { throw new Error(format(ERROR.UNSUPPORTED_OPERATION)); }
				},
				"onConnected":{
					get: function() { return client.onConnected; },
					set: function(newOnConnected) {
						if (typeof newOnConnected === "function")
							client.onConnected = newOnConnected;
						else
							throw new Error(format(ERROR.INVALID_TYPE, [typeof newOnConnected, "onConnected"]));
					}
				},
				"disconnectedPublishing":{
					get: function() { return client.disconnectedPublishing; },
					set: function(newDisconnectedPublishing) {
						client.disconnectedPublishing = newDisconnectedPublishing;
					}
				},
				"disconnectedBufferSize":{
					get: function() { return client.disconnectedBufferSize; },
					set: function(newDisconnectedBufferSize) {
						client.disconnectedBufferSize = newDisconnectedBufferSize;
					}
				},
				"onConnectionLost":{
					get: function() { return client.onConnectionLost; },
					set: function(newOnConnectionLost) {
						if (typeof newOnConnectionLost === "function")
							client.onConnectionLost = newOnConnectionLost;
						else
							throw new Error(format(ERROR.INVALID_TYPE, [typeof newOnConnectionLost, "onConnectionLost"]));
					}
				},
				"onMessageDelivered":{
					get: function() { return client.onMessageDelivered; },
					set: function(newOnMessageDelivered) {
						if (typeof newOnMessageDelivered === "function")
							client.onMessageDelivered = newOnMessageDelivered;
						else
							throw new Error(format(ERROR.INVALID_TYPE, [typeof newOnMessageDelivered, "onMessageDelivered"]));
					}
				},
				"onMessageArrived":{
					get: function() { return client.onMessageArrived; },
					set: function(newOnMessageArrived) {
						if (typeof newOnMessageArrived === "function")
							client.onMessageArrived = newOnMessageArrived;
						else
							throw new Error(format(ERROR.INVALID_TYPE, [typeof newOnMessageArrived, "onMessageArrived"]));
					}
				},
				"trace":{
					get: function() { return client.traceFunction; },
					set: function(trace) {
						if(typeof trace === "function"){
							client.traceFunction = trace;
						}else{
							throw new Error(format(ERROR.INVALID_TYPE, [typeof trace, "onTrace"]));
						}
					}
				},
			});

			/**
		 * Connect this Messaging client to its server.
		 *
		 * @name Paho.Client#connect
		 * @function
		 * @param {object} connectOptions - Attributes used with the connection.
		 * @param {number} connectOptions.timeout - If the connect has not succeeded within this
		 *                    number of seconds, it is deemed to have failed.
		 *                    The default is 30 seconds.
		 * @param {string} connectOptions.userName - Authentication username for this connection.
		 * @param {string} connectOptions.password - Authentication password for this connection.
		 * @param {Paho.Message} connectOptions.willMessage - sent by the server when the client
		 *                    disconnects abnormally.
		 * @param {number} connectOptions.keepAliveInterval - the server disconnects this client if
		 *                    there is no activity for this number of seconds.
		 *                    The default value of 60 seconds is assumed if not set.
		 * @param {boolean} connectOptions.cleanSession - if true(default) the client and server
		 *                    persistent state is deleted on successful connect.
		 * @param {boolean} connectOptions.useSSL - if present and true, use an SSL Websocket connection.
		 * @param {object} connectOptions.invocationContext - passed to the onSuccess callback or onFailure callback.
		 * @param {function} connectOptions.onSuccess - called when the connect acknowledgement
		 *                    has been received from the server.
		 * A single response object parameter is passed to the onSuccess callback containing the following fields:
		 * <ol>
		 * <li>invocationContext as passed in to the onSuccess method in the connectOptions.
		 * </ol>
	 * @param {function} connectOptions.onFailure - called when the connect request has failed or timed out.
		 * A single response object parameter is passed to the onFailure callback containing the following fields:
		 * <ol>
		 * <li>invocationContext as passed in to the onFailure method in the connectOptions.
		 * <li>errorCode a number indicating the nature of the error.
		 * <li>errorMessage text describing the error.
		 * </ol>
	 * @param {array} connectOptions.hosts - If present this contains either a set of hostnames or fully qualified
		 * WebSocket URIs (ws://iot.eclipse.org:80/ws), that are tried in order in place
		 * of the host and port paramater on the construtor. The hosts are tried one at at time in order until
		 * one of then succeeds.
	 * @param {array} connectOptions.ports - If present the set of ports matching the hosts. If hosts contains URIs, this property
		 * is not used.
	 * @param {boolean} connectOptions.reconnect - Sets whether the client will automatically attempt to reconnect
	 * to the server if the connection is lost.
	 *<ul>
	 *<li>If set to false, the client will not attempt to automatically reconnect to the server in the event that the
	 * connection is lost.</li>
	 *<li>If set to true, in the event that the connection is lost, the client will attempt to reconnect to the server.
	 * It will initially wait 1 second before it attempts to reconnect, for every failed reconnect attempt, the delay
	 * will double until it is at 2 minutes at which point the delay will stay at 2 minutes.</li>
	 *</ul>
	 * @param {number} connectOptions.mqttVersion - The version of MQTT to use to connect to the MQTT Broker.
	 *<ul>
	 *<li>3 - MQTT V3.1</li>
	 *<li>4 - MQTT V3.1.1</li>
	 *</ul>
	 * @param {boolean} connectOptions.mqttVersionExplicit - If set to true, will force the connection to use the
	 * selected MQTT Version or will fail to connect.
	 * @param {array} connectOptions.uris - If present, should contain a list of fully qualified WebSocket uris
	 * (e.g. ws://iot.eclipse.org:80/ws), that are tried in order in place of the host and port parameter of the construtor.
	 * The uris are tried one at a time in order until one of them succeeds. Do not use this in conjunction with hosts as
	 * the hosts array will be converted to uris and will overwrite this property.
		 * @throws {InvalidState} If the client is not in disconnected state. The client must have received connectionLost
		 * or disconnected before calling connect for a second or subsequent time.
		 */
			this.connect = function (connectOptions) {
				connectOptions = connectOptions || {} ;
				validate(connectOptions,  {timeout:"number",
					userName:"string",
					password:"string",
					willMessage:"object",
					keepAliveInterval:"number",
					cleanSession:"boolean",
					useSSL:"boolean",
					invocationContext:"object",
					onSuccess:"function",
					onFailure:"function",
					hosts:"object",
					ports:"object",
					reconnect:"boolean",
					mqttVersion:"number",
					mqttVersionExplicit:"boolean",
					uris: "object"});

				// If no keep alive interval is set, assume 60 seconds.
				if (connectOptions.keepAliveInterval === undefined)
					connectOptions.keepAliveInterval = 60;

				if (connectOptions.mqttVersion > 4 || connectOptions.mqttVersion < 3) {
					throw new Error(format(ERROR.INVALID_ARGUMENT, [connectOptions.mqttVersion, "connectOptions.mqttVersion"]));
				}

				if (connectOptions.mqttVersion === undefined) {
					connectOptions.mqttVersionExplicit = false;
					connectOptions.mqttVersion = 4;
				} else {
					connectOptions.mqttVersionExplicit = true;
				}

				//Check that if password is set, so is username
				if (connectOptions.password !== undefined && connectOptions.userName === undefined)
					throw new Error(format(ERROR.INVALID_ARGUMENT, [connectOptions.password, "connectOptions.password"]));

				if (connectOptions.willMessage) {
					if (!(connectOptions.willMessage instanceof Message))
						throw new Error(format(ERROR.INVALID_TYPE, [connectOptions.willMessage, "connectOptions.willMessage"]));
					// The will message must have a payload that can be represented as a string.
					// Cause the willMessage to throw an exception if this is not the case.
					connectOptions.willMessage.stringPayload = null;

					if (typeof connectOptions.willMessage.destinationName === "undefined")
						throw new Error(format(ERROR.INVALID_TYPE, [typeof connectOptions.willMessage.destinationName, "connectOptions.willMessage.destinationName"]));
				}
				if (typeof connectOptions.cleanSession === "undefined")
					connectOptions.cleanSession = true;
				if (connectOptions.hosts) {

					if (!(connectOptions.hosts instanceof Array) )
						throw new Error(format(ERROR.INVALID_ARGUMENT, [connectOptions.hosts, "connectOptions.hosts"]));
					if (connectOptions.hosts.length <1 )
						throw new Error(format(ERROR.INVALID_ARGUMENT, [connectOptions.hosts, "connectOptions.hosts"]));

					var usingURIs = false;
					for (var i = 0; i<connectOptions.hosts.length; i++) {
						if (typeof connectOptions.hosts[i] !== "string")
							throw new Error(format(ERROR.INVALID_TYPE, [typeof connectOptions.hosts[i], "connectOptions.hosts["+i+"]"]));
						if (/^(wss?):\/\/((\[(.+)\])|([^\/]+?))(:(\d+))?(\/.*)$/.test(connectOptions.hosts[i])) {
							if (i === 0) {
								usingURIs = true;
							} else if (!usingURIs) {
								throw new Error(format(ERROR.INVALID_ARGUMENT, [connectOptions.hosts[i], "connectOptions.hosts["+i+"]"]));
							}
						} else if (usingURIs) {
							throw new Error(format(ERROR.INVALID_ARGUMENT, [connectOptions.hosts[i], "connectOptions.hosts["+i+"]"]));
						}
					}

					if (!usingURIs) {
						if (!connectOptions.ports)
							throw new Error(format(ERROR.INVALID_ARGUMENT, [connectOptions.ports, "connectOptions.ports"]));
						if (!(connectOptions.ports instanceof Array) )
							throw new Error(format(ERROR.INVALID_ARGUMENT, [connectOptions.ports, "connectOptions.ports"]));
						if (connectOptions.hosts.length !== connectOptions.ports.length)
							throw new Error(format(ERROR.INVALID_ARGUMENT, [connectOptions.ports, "connectOptions.ports"]));

						connectOptions.uris = [];

						for (var i = 0; i<connectOptions.hosts.length; i++) {
							if (typeof connectOptions.ports[i] !== "number" || connectOptions.ports[i] < 0)
								throw new Error(format(ERROR.INVALID_TYPE, [typeof connectOptions.ports[i], "connectOptions.ports["+i+"]"]));
							var host = connectOptions.hosts[i];
							var port = connectOptions.ports[i];

							var ipv6 = (host.indexOf(":") !== -1);
							uri = "ws://"+(ipv6?"["+host+"]":host)+":"+port+path;
							connectOptions.uris.push(uri);
						}
					} else {
						connectOptions.uris = connectOptions.hosts;
					}
				}

				client.connect(connectOptions);
			};

			/**
		 * Subscribe for messages, request receipt of a copy of messages sent to the destinations described by the filter.
		 *
		 * @name Paho.Client#subscribe
		 * @function
		 * @param {string} filter describing the destinations to receive messages from.
		 * <br>
		 * @param {object} subscribeOptions - used to control the subscription
		 *
		 * @param {number} subscribeOptions.qos - the maximum qos of any publications sent
		 *                                  as a result of making this subscription.
		 * @param {object} subscribeOptions.invocationContext - passed to the onSuccess callback
		 *                                  or onFailure callback.
		 * @param {function} subscribeOptions.onSuccess - called when the subscribe acknowledgement
		 *                                  has been received from the server.
		 *                                  A single response object parameter is passed to the onSuccess callback containing the following fields:
		 *                                  <ol>
		 *                                  <li>invocationContext if set in the subscribeOptions.
		 *                                  </ol>
		 * @param {function} subscribeOptions.onFailure - called when the subscribe request has failed or timed out.
		 *                                  A single response object parameter is passed to the onFailure callback containing the following fields:
		 *                                  <ol>
		 *                                  <li>invocationContext - if set in the subscribeOptions.
		 *                                  <li>errorCode - a number indicating the nature of the error.
		 *                                  <li>errorMessage - text describing the error.
		 *                                  </ol>
		 * @param {number} subscribeOptions.timeout - which, if present, determines the number of
		 *                                  seconds after which the onFailure calback is called.
		 *                                  The presence of a timeout does not prevent the onSuccess
		 *                                  callback from being called when the subscribe completes.
		 * @throws {InvalidState} if the client is not in connected state.
		 */
			this.subscribe = function (filter, subscribeOptions) {
				if (typeof filter !== "string" && filter.constructor !== Array)
					throw new Error("Invalid argument:"+filter);
				subscribeOptions = subscribeOptions || {} ;
				validate(subscribeOptions,  {qos:"number",
					invocationContext:"object",
					onSuccess:"function",
					onFailure:"function",
					timeout:"number"
				});
				if (subscribeOptions.timeout && !subscribeOptions.onFailure)
					throw new Error("subscribeOptions.timeout specified with no onFailure callback.");
				if (typeof subscribeOptions.qos !== "undefined" && !(subscribeOptions.qos === 0 || subscribeOptions.qos === 1 || subscribeOptions.qos === 2 ))
					throw new Error(format(ERROR.INVALID_ARGUMENT, [subscribeOptions.qos, "subscribeOptions.qos"]));
				client.subscribe(filter, subscribeOptions);
			};

		/**
		 * Unsubscribe for messages, stop receiving messages sent to destinations described by the filter.
		 *
		 * @name Paho.Client#unsubscribe
		 * @function
		 * @param {string} filter - describing the destinations to receive messages from.
		 * @param {object} unsubscribeOptions - used to control the subscription
		 * @param {object} unsubscribeOptions.invocationContext - passed to the onSuccess callback
											  or onFailure callback.
		 * @param {function} unsubscribeOptions.onSuccess - called when the unsubscribe acknowledgement has been received from the server.
		 *                                    A single response object parameter is passed to the
		 *                                    onSuccess callback containing the following fields:
		 *                                    <ol>
		 *                                    <li>invocationContext - if set in the unsubscribeOptions.
		 *                                    </ol>
		 * @param {function} unsubscribeOptions.onFailure called when the unsubscribe request has failed or timed out.
		 *                                    A single response object parameter is passed to the onFailure callback containing the following fields:
		 *                                    <ol>
		 *                                    <li>invocationContext - if set in the unsubscribeOptions.
		 *                                    <li>errorCode - a number indicating the nature of the error.
		 *                                    <li>errorMessage - text describing the error.
		 *                                    </ol>
		 * @param {number} unsubscribeOptions.timeout - which, if present, determines the number of seconds
		 *                                    after which the onFailure callback is called. The presence of
		 *                                    a timeout does not prevent the onSuccess callback from being
		 *                                    called when the unsubscribe completes
		 * @throws {InvalidState} if the client is not in connected state.
		 */
			this.unsubscribe = function (filter, unsubscribeOptions) {
				if (typeof filter !== "string" && filter.constructor !== Array)
					throw new Error("Invalid argument:"+filter);
				unsubscribeOptions = unsubscribeOptions || {} ;
				validate(unsubscribeOptions,  {invocationContext:"object",
					onSuccess:"function",
					onFailure:"function",
					timeout:"number"
				});
				if (unsubscribeOptions.timeout && !unsubscribeOptions.onFailure)
					throw new Error("unsubscribeOptions.timeout specified with no onFailure callback.");
				client.unsubscribe(filter, unsubscribeOptions);
			};

			/**
		 * Send a message to the consumers of the destination in the Message.
		 *
		 * @name Paho.Client#send
		 * @function
		 * @param {string|Paho.Message} topic - <b>mandatory</b> The name of the destination to which the message is to be sent.
		 * 					   - If it is the only parameter, used as Paho.Message object.
		 * @param {String|ArrayBuffer} payload - The message data to be sent.
		 * @param {number} qos The Quality of Service used to deliver the message.
		 * 		<dl>
		 * 			<dt>0 Best effort (default).
		 *     			<dt>1 At least once.
		 *     			<dt>2 Exactly once.
		 * 		</dl>
		 * @param {Boolean} retained If true, the message is to be retained by the server and delivered
		 *                     to both current and future subscriptions.
		 *                     If false the server only delivers the message to current subscribers, this is the default for new Messages.
		 *                     A received message has the retained boolean set to true if the message was published
		 *                     with the retained boolean set to true
		 *                     and the subscrption was made after the message has been published.
		 * @throws {InvalidState} if the client is not connected.
		 */
			this.send = function (topic,payload,qos,retained) {
				var message ;

				if(arguments.length === 0){
					throw new Error("Invalid argument."+"length");

				}else if(arguments.length == 1) {

					if (!(topic instanceof Message) && (typeof topic !== "string"))
						throw new Error("Invalid argument:"+ typeof topic);

					message = topic;
					if (typeof message.destinationName === "undefined")
						throw new Error(format(ERROR.INVALID_ARGUMENT,[message.destinationName,"Message.destinationName"]));
					client.send(message);

				}else {
				//parameter checking in Message object
					message = new Message(payload);
					message.destinationName = topic;
					if(arguments.length >= 3)
						message.qos = qos;
					if(arguments.length >= 4)
						message.retained = retained;
					client.send(message);
				}
			};

			/**
		 * Publish a message to the consumers of the destination in the Message.
		 * Synonym for Paho.Mqtt.Client#send
		 *
		 * @name Paho.Client#publish
		 * @function
		 * @param {string|Paho.Message} topic - <b>mandatory</b> The name of the topic to which the message is to be published.
		 * 					   - If it is the only parameter, used as Paho.Message object.
		 * @param {String|ArrayBuffer} payload - The message data to be published.
		 * @param {number} qos The Quality of Service used to deliver the message.
		 * 		<dl>
		 * 			<dt>0 Best effort (default).
		 *     			<dt>1 At least once.
		 *     			<dt>2 Exactly once.
		 * 		</dl>
		 * @param {Boolean} retained If true, the message is to be retained by the server and delivered
		 *                     to both current and future subscriptions.
		 *                     If false the server only delivers the message to current subscribers, this is the default for new Messages.
		 *                     A received message has the retained boolean set to true if the message was published
		 *                     with the retained boolean set to true
		 *                     and the subscrption was made after the message has been published.
		 * @throws {InvalidState} if the client is not connected.
		 */
			this.publish = function(topic,payload,qos,retained) {
				var message ;

				if(arguments.length === 0){
					throw new Error("Invalid argument."+"length");

				}else if(arguments.length == 1) {

					if (!(topic instanceof Message) && (typeof topic !== "string"))
						throw new Error("Invalid argument:"+ typeof topic);

					message = topic;
					if (typeof message.destinationName === "undefined")
						throw new Error(format(ERROR.INVALID_ARGUMENT,[message.destinationName,"Message.destinationName"]));
					client.send(message);

				}else {
					//parameter checking in Message object
					message = new Message(payload);
					message.destinationName = topic;
					if(arguments.length >= 3)
						message.qos = qos;
					if(arguments.length >= 4)
						message.retained = retained;
					client.send(message);
				}
			};

			/**
		 * Normal disconnect of this Messaging client from its server.
		 *
		 * @name Paho.Client#disconnect
		 * @function
		 * @throws {InvalidState} if the client is already disconnected.
		 */
			this.disconnect = function () {
				client.disconnect();
			};

			/**
		 * Get the contents of the trace log.
		 *
		 * @name Paho.Client#getTraceLog
		 * @function
		 * @return {Object[]} tracebuffer containing the time ordered trace records.
		 */
			this.getTraceLog = function () {
				return client.getTraceLog();
			};

			/**
		 * Start tracing.
		 *
		 * @name Paho.Client#startTrace
		 * @function
		 */
			this.startTrace = function () {
				client.startTrace();
			};

			/**
		 * Stop tracing.
		 *
		 * @name Paho.Client#stopTrace
		 * @function
		 */
			this.stopTrace = function () {
				client.stopTrace();
			};

			this.isConnected = function() {
				return client.connected;
			};
		};

		/**
	 * An application message, sent or received.
	 * <p>
	 * All attributes may be null, which implies the default values.
	 *
	 * @name Paho.Message
	 * @constructor
	 * @param {String|ArrayBuffer} payload The message data to be sent.
	 * <p>
	 * @property {string} payloadString <i>read only</i> The payload as a string if the payload consists of valid UTF-8 characters.
	 * @property {ArrayBuffer} payloadBytes <i>read only</i> The payload as an ArrayBuffer.
	 * <p>
	 * @property {string} destinationName <b>mandatory</b> The name of the destination to which the message is to be sent
	 *                    (for messages about to be sent) or the name of the destination from which the message has been received.
	 *                    (for messages received by the onMessage function).
	 * <p>
	 * @property {number} qos The Quality of Service used to deliver the message.
	 * <dl>
	 *     <dt>0 Best effort (default).
	 *     <dt>1 At least once.
	 *     <dt>2 Exactly once.
	 * </dl>
	 * <p>
	 * @property {Boolean} retained If true, the message is to be retained by the server and delivered
	 *                     to both current and future subscriptions.
	 *                     If false the server only delivers the message to current subscribers, this is the default for new Messages.
	 *                     A received message has the retained boolean set to true if the message was published
	 *                     with the retained boolean set to true
	 *                     and the subscrption was made after the message has been published.
	 * <p>
	 * @property {Boolean} duplicate <i>read only</i> If true, this message might be a duplicate of one which has already been received.
	 *                     This is only set on messages received from the server.
	 *
	 */
		var Message = function (newPayload) {
			var payload;
			if (   typeof newPayload === "string" ||
		newPayload instanceof ArrayBuffer ||
		(ArrayBuffer.isView(newPayload) && !(newPayload instanceof DataView))
			) {
				payload = newPayload;
			} else {
				throw (format(ERROR.INVALID_ARGUMENT, [newPayload, "newPayload"]));
			}

			var destinationName;
			var qos = 0;
			var retained = false;
			var duplicate = false;

			Object.defineProperties(this,{
				"payloadString":{
					enumerable : true,
					get : function () {
						if (typeof payload === "string")
							return payload;
						else
							return parseUTF8(payload, 0, payload.length);
					}
				},
				"payloadBytes":{
					enumerable: true,
					get: function() {
						if (typeof payload === "string") {
							var buffer = new ArrayBuffer(UTF8Length(payload));
							var byteStream = new Uint8Array(buffer);
							stringToUTF8(payload, byteStream, 0);

							return byteStream;
						} else {
							return payload;
						}
					}
				},
				"destinationName":{
					enumerable: true,
					get: function() { return destinationName; },
					set: function(newDestinationName) {
						if (typeof newDestinationName === "string")
							destinationName = newDestinationName;
						else
							throw new Error(format(ERROR.INVALID_ARGUMENT, [newDestinationName, "newDestinationName"]));
					}
				},
				"qos":{
					enumerable: true,
					get: function() { return qos; },
					set: function(newQos) {
						if (newQos === 0 || newQos === 1 || newQos === 2 )
							qos = newQos;
						else
							throw new Error("Invalid argument:"+newQos);
					}
				},
				"retained":{
					enumerable: true,
					get: function() { return retained; },
					set: function(newRetained) {
						if (typeof newRetained === "boolean")
							retained = newRetained;
						else
							throw new Error(format(ERROR.INVALID_ARGUMENT, [newRetained, "newRetained"]));
					}
				},
				"topic":{
					enumerable: true,
					get: function() { return destinationName; },
					set: function(newTopic) {destinationName=newTopic;}
				},
				"duplicate":{
					enumerable: true,
					get: function() { return duplicate; },
					set: function(newDuplicate) {duplicate=newDuplicate;}
				}
			});
		};

		// Module contents.
		return {
			Client: Client,
			Message: Message
		};
	// eslint-disable-next-line no-nested-ternary
	})(typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {});
	return PahoMQTT;
});

/*! pako 2.0.4 https://github.com/nodeca/pako @license (MIT AND Zlib) */
(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports) :
  typeof define === 'function' && define.amd ? define(['exports'], factory) :
  (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global.pako = {}));
}(this, (function (exports) { 'use strict';

  // (C) 2014-2017 Vitaly Puzrin and Andrey Tupitsin
  //
  // This software is provided 'as-is', without any express or implied
  // warranty. In no event will the authors be held liable for any damages
  // arising from the use of this software.
  //
  // Permission is granted to anyone to use this software for any purpose,
  // including commercial applications, and to alter it and redistribute it
  // freely, subject to the following restrictions:
  //
  // 1. The origin of this software must not be misrepresented; you must not
  //   claim that you wrote the original software. If you use this software
  //   in a product, an acknowledgment in the product documentation would be
  //   appreciated but is not required.
  // 2. Altered source versions must be plainly marked as such, and must not be
  //   misrepresented as being the original software.
  // 3. This notice may not be removed or altered from any source distribution.

  /* eslint-disable space-unary-ops */

  /* Public constants ==========================================================*/

  /* ===========================================================================*/
  //const Z_FILTERED          = 1;
  //const Z_HUFFMAN_ONLY      = 2;
  //const Z_RLE               = 3;

  var Z_FIXED$1 = 4; //const Z_DEFAULT_STRATEGY  = 0;

  /* Possible values of the data_type field (though see inflate()) */

  var Z_BINARY = 0;
  var Z_TEXT = 1; //const Z_ASCII             = 1; // = Z_TEXT

  var Z_UNKNOWN$1 = 2;
  /*============================================================================*/

  function zero$1(buf) {
    var len = buf.length;

    while (--len >= 0) {
      buf[len] = 0;
    }
  } // From zutil.h


  var STORED_BLOCK = 0;
  var STATIC_TREES = 1;
  var DYN_TREES = 2;
  /* The three kinds of block type */

  var MIN_MATCH$1 = 3;
  var MAX_MATCH$1 = 258;
  /* The minimum and maximum match lengths */
  // From deflate.h

  /* ===========================================================================
   * Internal compression state.
   */

  var LENGTH_CODES$1 = 29;
  /* number of length codes, not counting the special END_BLOCK code */

  var LITERALS$1 = 256;
  /* number of literal bytes 0..255 */

  var L_CODES$1 = LITERALS$1 + 1 + LENGTH_CODES$1;
  /* number of Literal or Length codes, including the END_BLOCK code */

  var D_CODES$1 = 30;
  /* number of distance codes */

  var BL_CODES$1 = 19;
  /* number of codes used to transfer the bit lengths */

  var HEAP_SIZE$1 = 2 * L_CODES$1 + 1;
  /* maximum heap size */

  var MAX_BITS$1 = 15;
  /* All codes must not exceed MAX_BITS bits */

  var Buf_size = 16;
  /* size of bit buffer in bi_buf */

  /* ===========================================================================
   * Constants
   */

  var MAX_BL_BITS = 7;
  /* Bit length codes must not exceed MAX_BL_BITS bits */

  var END_BLOCK = 256;
  /* end of block literal code */

  var REP_3_6 = 16;
  /* repeat previous bit length 3-6 times (2 bits of repeat count) */

  var REPZ_3_10 = 17;
  /* repeat a zero length 3-10 times  (3 bits of repeat count) */

  var REPZ_11_138 = 18;
  /* repeat a zero length 11-138 times  (7 bits of repeat count) */

  /* eslint-disable comma-spacing,array-bracket-spacing */

  var extra_lbits =
  /* extra bits for each length code */
  new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0]);
  var extra_dbits =
  /* extra bits for each distance code */
  new Uint8Array([0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13]);
  var extra_blbits =
  /* extra bits for each bit length code */
  new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 3, 7]);
  var bl_order = new Uint8Array([16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15]);
  /* eslint-enable comma-spacing,array-bracket-spacing */

  /* The lengths of the bit length codes are sent in order of decreasing
   * probability, to avoid transmitting the lengths for unused bit length codes.
   */

  /* ===========================================================================
   * Local data. These are initialized only once.
   */
  // We pre-fill arrays with 0 to avoid uninitialized gaps

  var DIST_CODE_LEN = 512;
  /* see definition of array dist_code below */
  // !!!! Use flat array instead of structure, Freq = i*2, Len = i*2+1

  var static_ltree = new Array((L_CODES$1 + 2) * 2);
  zero$1(static_ltree);
  /* The static literal tree. Since the bit lengths are imposed, there is no
   * need for the L_CODES extra codes used during heap construction. However
   * The codes 286 and 287 are needed to build a canonical tree (see _tr_init
   * below).
   */

  var static_dtree = new Array(D_CODES$1 * 2);
  zero$1(static_dtree);
  /* The static distance tree. (Actually a trivial tree since all codes use
   * 5 bits.)
   */

  var _dist_code = new Array(DIST_CODE_LEN);

  zero$1(_dist_code);
  /* Distance codes. The first 256 values correspond to the distances
   * 3 .. 258, the last 256 values correspond to the top 8 bits of
   * the 15 bit distances.
   */

  var _length_code = new Array(MAX_MATCH$1 - MIN_MATCH$1 + 1);

  zero$1(_length_code);
  /* length code for each normalized match length (0 == MIN_MATCH) */

  var base_length = new Array(LENGTH_CODES$1);
  zero$1(base_length);
  /* First normalized length for each code (0 = MIN_MATCH) */

  var base_dist = new Array(D_CODES$1);
  zero$1(base_dist);
  /* First normalized distance for each code (0 = distance of 1) */

  function StaticTreeDesc(static_tree, extra_bits, extra_base, elems, max_length) {
    this.static_tree = static_tree;
    /* static tree or NULL */

    this.extra_bits = extra_bits;
    /* extra bits for each code or NULL */

    this.extra_base = extra_base;
    /* base index for extra_bits */

    this.elems = elems;
    /* max number of elements in the tree */

    this.max_length = max_length;
    /* max bit length for the codes */
    // show if `static_tree` has data or dummy - needed for monomorphic objects

    this.has_stree = static_tree && static_tree.length;
  }

  var static_l_desc;
  var static_d_desc;
  var static_bl_desc;

  function TreeDesc(dyn_tree, stat_desc) {
    this.dyn_tree = dyn_tree;
    /* the dynamic tree */

    this.max_code = 0;
    /* largest code with non zero frequency */

    this.stat_desc = stat_desc;
    /* the corresponding static tree */
  }

  var d_code = function d_code(dist) {
    return dist < 256 ? _dist_code[dist] : _dist_code[256 + (dist >>> 7)];
  };
  /* ===========================================================================
   * Output a short LSB first on the stream.
   * IN assertion: there is enough room in pendingBuf.
   */


  var put_short = function put_short(s, w) {
    //    put_byte(s, (uch)((w) & 0xff));
    //    put_byte(s, (uch)((ush)(w) >> 8));
    s.pending_buf[s.pending++] = w & 0xff;
    s.pending_buf[s.pending++] = w >>> 8 & 0xff;
  };
  /* ===========================================================================
   * Send a value on a given number of bits.
   * IN assertion: length <= 16 and value fits in length bits.
   */


  var send_bits = function send_bits(s, value, length) {
    if (s.bi_valid > Buf_size - length) {
      s.bi_buf |= value << s.bi_valid & 0xffff;
      put_short(s, s.bi_buf);
      s.bi_buf = value >> Buf_size - s.bi_valid;
      s.bi_valid += length - Buf_size;
    } else {
      s.bi_buf |= value << s.bi_valid & 0xffff;
      s.bi_valid += length;
    }
  };

  var send_code = function send_code(s, c, tree) {
    send_bits(s, tree[c * 2]
    /*.Code*/
    , tree[c * 2 + 1]
    /*.Len*/
    );
  };
  /* ===========================================================================
   * Reverse the first len bits of a code, using straightforward code (a faster
   * method would use a table)
   * IN assertion: 1 <= len <= 15
   */


  var bi_reverse = function bi_reverse(code, len) {
    var res = 0;

    do {
      res |= code & 1;
      code >>>= 1;
      res <<= 1;
    } while (--len > 0);

    return res >>> 1;
  };
  /* ===========================================================================
   * Flush the bit buffer, keeping at most 7 bits in it.
   */


  var bi_flush = function bi_flush(s) {
    if (s.bi_valid === 16) {
      put_short(s, s.bi_buf);
      s.bi_buf = 0;
      s.bi_valid = 0;
    } else if (s.bi_valid >= 8) {
      s.pending_buf[s.pending++] = s.bi_buf & 0xff;
      s.bi_buf >>= 8;
      s.bi_valid -= 8;
    }
  };
  /* ===========================================================================
   * Compute the optimal bit lengths for a tree and update the total bit length
   * for the current block.
   * IN assertion: the fields freq and dad are set, heap[heap_max] and
   *    above are the tree nodes sorted by increasing frequency.
   * OUT assertions: the field len is set to the optimal bit length, the
   *     array bl_count contains the frequencies for each bit length.
   *     The length opt_len is updated; static_len is also updated if stree is
   *     not null.
   */


  var gen_bitlen = function gen_bitlen(s, desc) //    deflate_state *s;
  //    tree_desc *desc;    /* the tree descriptor */
  {
    var tree = desc.dyn_tree;
    var max_code = desc.max_code;
    var stree = desc.stat_desc.static_tree;
    var has_stree = desc.stat_desc.has_stree;
    var extra = desc.stat_desc.extra_bits;
    var base = desc.stat_desc.extra_base;
    var max_length = desc.stat_desc.max_length;
    var h;
    /* heap index */

    var n, m;
    /* iterate over the tree elements */

    var bits;
    /* bit length */

    var xbits;
    /* extra bits */

    var f;
    /* frequency */

    var overflow = 0;
    /* number of elements with bit length too large */

    for (bits = 0; bits <= MAX_BITS$1; bits++) {
      s.bl_count[bits] = 0;
    }
    /* In a first pass, compute the optimal bit lengths (which may
     * overflow in the case of the bit length tree).
     */


    tree[s.heap[s.heap_max] * 2 + 1]
    /*.Len*/
    = 0;
    /* root of the heap */

    for (h = s.heap_max + 1; h < HEAP_SIZE$1; h++) {
      n = s.heap[h];
      bits = tree[tree[n * 2 + 1]
      /*.Dad*/
      * 2 + 1]
      /*.Len*/
      + 1;

      if (bits > max_length) {
        bits = max_length;
        overflow++;
      }

      tree[n * 2 + 1]
      /*.Len*/
      = bits;
      /* We overwrite tree[n].Dad which is no longer needed */

      if (n > max_code) {
        continue;
      }
      /* not a leaf node */


      s.bl_count[bits]++;
      xbits = 0;

      if (n >= base) {
        xbits = extra[n - base];
      }

      f = tree[n * 2]
      /*.Freq*/
      ;
      s.opt_len += f * (bits + xbits);

      if (has_stree) {
        s.static_len += f * (stree[n * 2 + 1]
        /*.Len*/
        + xbits);
      }
    }

    if (overflow === 0) {
      return;
    } // Trace((stderr,"\nbit length overflow\n"));

    /* This happens for example on obj2 and pic of the Calgary corpus */

    /* Find the first bit length which could increase: */


    do {
      bits = max_length - 1;

      while (s.bl_count[bits] === 0) {
        bits--;
      }

      s.bl_count[bits]--;
      /* move one leaf down the tree */

      s.bl_count[bits + 1] += 2;
      /* move one overflow item as its brother */

      s.bl_count[max_length]--;
      /* The brother of the overflow item also moves one step up,
       * but this does not affect bl_count[max_length]
       */

      overflow -= 2;
    } while (overflow > 0);
    /* Now recompute all bit lengths, scanning in increasing frequency.
     * h is still equal to HEAP_SIZE. (It is simpler to reconstruct all
     * lengths instead of fixing only the wrong ones. This idea is taken
     * from 'ar' written by Haruhiko Okumura.)
     */


    for (bits = max_length; bits !== 0; bits--) {
      n = s.bl_count[bits];

      while (n !== 0) {
        m = s.heap[--h];

        if (m > max_code) {
          continue;
        }

        if (tree[m * 2 + 1]
        /*.Len*/
        !== bits) {
          // Trace((stderr,"code %d bits %d->%d\n", m, tree[m].Len, bits));
          s.opt_len += (bits - tree[m * 2 + 1]
          /*.Len*/
          ) * tree[m * 2]
          /*.Freq*/
          ;
          tree[m * 2 + 1]
          /*.Len*/
          = bits;
        }

        n--;
      }
    }
  };
  /* ===========================================================================
   * Generate the codes for a given tree and bit counts (which need not be
   * optimal).
   * IN assertion: the array bl_count contains the bit length statistics for
   * the given tree and the field len is set for all tree elements.
   * OUT assertion: the field code is set for all tree elements of non
   *     zero code length.
   */


  var gen_codes = function gen_codes(tree, max_code, bl_count) //    ct_data *tree;             /* the tree to decorate */
  //    int max_code;              /* largest code with non zero frequency */
  //    ushf *bl_count;            /* number of codes at each bit length */
  {
    var next_code = new Array(MAX_BITS$1 + 1);
    /* next code value for each bit length */

    var code = 0;
    /* running code value */

    var bits;
    /* bit index */

    var n;
    /* code index */

    /* The distribution counts are first used to generate the code values
     * without bit reversal.
     */

    for (bits = 1; bits <= MAX_BITS$1; bits++) {
      next_code[bits] = code = code + bl_count[bits - 1] << 1;
    }
    /* Check that the bit counts in bl_count are consistent. The last code
     * must be all ones.
     */
    //Assert (code + bl_count[MAX_BITS]-1 == (1<<MAX_BITS)-1,
    //        "inconsistent bit counts");
    //Tracev((stderr,"\ngen_codes: max_code %d ", max_code));


    for (n = 0; n <= max_code; n++) {
      var len = tree[n * 2 + 1]
      /*.Len*/
      ;

      if (len === 0) {
        continue;
      }
      /* Now reverse the bits */


      tree[n * 2]
      /*.Code*/
      = bi_reverse(next_code[len]++, len); //Tracecv(tree != static_ltree, (stderr,"\nn %3d %c l %2d c %4x (%x) ",
      //     n, (isgraph(n) ? n : ' '), len, tree[n].Code, next_code[len]-1));
    }
  };
  /* ===========================================================================
   * Initialize the various 'constant' tables.
   */


  var tr_static_init = function tr_static_init() {
    var n;
    /* iterates over tree elements */

    var bits;
    /* bit counter */

    var length;
    /* length value */

    var code;
    /* code value */

    var dist;
    /* distance index */

    var bl_count = new Array(MAX_BITS$1 + 1);
    /* number of codes at each bit length for an optimal tree */
    // do check in _tr_init()
    //if (static_init_done) return;

    /* For some embedded targets, global variables are not initialized: */

    /*#ifdef NO_INIT_GLOBAL_POINTERS
      static_l_desc.static_tree = static_ltree;
      static_l_desc.extra_bits = extra_lbits;
      static_d_desc.static_tree = static_dtree;
      static_d_desc.extra_bits = extra_dbits;
      static_bl_desc.extra_bits = extra_blbits;
    #endif*/

    /* Initialize the mapping length (0..255) -> length code (0..28) */

    length = 0;

    for (code = 0; code < LENGTH_CODES$1 - 1; code++) {
      base_length[code] = length;

      for (n = 0; n < 1 << extra_lbits[code]; n++) {
        _length_code[length++] = code;
      }
    } //Assert (length == 256, "tr_static_init: length != 256");

    /* Note that the length 255 (match length 258) can be represented
     * in two different ways: code 284 + 5 bits or code 285, so we
     * overwrite length_code[255] to use the best encoding:
     */


    _length_code[length - 1] = code;
    /* Initialize the mapping dist (0..32K) -> dist code (0..29) */

    dist = 0;

    for (code = 0; code < 16; code++) {
      base_dist[code] = dist;

      for (n = 0; n < 1 << extra_dbits[code]; n++) {
        _dist_code[dist++] = code;
      }
    } //Assert (dist == 256, "tr_static_init: dist != 256");


    dist >>= 7;
    /* from now on, all distances are divided by 128 */

    for (; code < D_CODES$1; code++) {
      base_dist[code] = dist << 7;

      for (n = 0; n < 1 << extra_dbits[code] - 7; n++) {
        _dist_code[256 + dist++] = code;
      }
    } //Assert (dist == 256, "tr_static_init: 256+dist != 512");

    /* Construct the codes of the static literal tree */


    for (bits = 0; bits <= MAX_BITS$1; bits++) {
      bl_count[bits] = 0;
    }

    n = 0;

    while (n <= 143) {
      static_ltree[n * 2 + 1]
      /*.Len*/
      = 8;
      n++;
      bl_count[8]++;
    }

    while (n <= 255) {
      static_ltree[n * 2 + 1]
      /*.Len*/
      = 9;
      n++;
      bl_count[9]++;
    }

    while (n <= 279) {
      static_ltree[n * 2 + 1]
      /*.Len*/
      = 7;
      n++;
      bl_count[7]++;
    }

    while (n <= 287) {
      static_ltree[n * 2 + 1]
      /*.Len*/
      = 8;
      n++;
      bl_count[8]++;
    }
    /* Codes 286 and 287 do not exist, but we must include them in the
     * tree construction to get a canonical Huffman tree (longest code
     * all ones)
     */


    gen_codes(static_ltree, L_CODES$1 + 1, bl_count);
    /* The static distance tree is trivial: */

    for (n = 0; n < D_CODES$1; n++) {
      static_dtree[n * 2 + 1]
      /*.Len*/
      = 5;
      static_dtree[n * 2]
      /*.Code*/
      = bi_reverse(n, 5);
    } // Now data ready and we can init static trees


    static_l_desc = new StaticTreeDesc(static_ltree, extra_lbits, LITERALS$1 + 1, L_CODES$1, MAX_BITS$1);
    static_d_desc = new StaticTreeDesc(static_dtree, extra_dbits, 0, D_CODES$1, MAX_BITS$1);
    static_bl_desc = new StaticTreeDesc(new Array(0), extra_blbits, 0, BL_CODES$1, MAX_BL_BITS); //static_init_done = true;
  };
  /* ===========================================================================
   * Initialize a new block.
   */


  var init_block = function init_block(s) {
    var n;
    /* iterates over tree elements */

    /* Initialize the trees. */

    for (n = 0; n < L_CODES$1; n++) {
      s.dyn_ltree[n * 2]
      /*.Freq*/
      = 0;
    }

    for (n = 0; n < D_CODES$1; n++) {
      s.dyn_dtree[n * 2]
      /*.Freq*/
      = 0;
    }

    for (n = 0; n < BL_CODES$1; n++) {
      s.bl_tree[n * 2]
      /*.Freq*/
      = 0;
    }

    s.dyn_ltree[END_BLOCK * 2]
    /*.Freq*/
    = 1;
    s.opt_len = s.static_len = 0;
    s.last_lit = s.matches = 0;
  };
  /* ===========================================================================
   * Flush the bit buffer and align the output on a byte boundary
   */


  var bi_windup = function bi_windup(s) {
    if (s.bi_valid > 8) {
      put_short(s, s.bi_buf);
    } else if (s.bi_valid > 0) {
      //put_byte(s, (Byte)s->bi_buf);
      s.pending_buf[s.pending++] = s.bi_buf;
    }

    s.bi_buf = 0;
    s.bi_valid = 0;
  };
  /* ===========================================================================
   * Copy a stored block, storing first the length and its
   * one's complement if requested.
   */


  var copy_block = function copy_block(s, buf, len, header) //DeflateState *s;
  //charf    *buf;    /* the input data */
  //unsigned len;     /* its length */
  //int      header;  /* true if block header must be written */
  {
    bi_windup(s);
    /* align on byte boundary */

    if (header) {
      put_short(s, len);
      put_short(s, ~len);
    } //  while (len--) {
    //    put_byte(s, *buf++);
    //  }


    s.pending_buf.set(s.window.subarray(buf, buf + len), s.pending);
    s.pending += len;
  };
  /* ===========================================================================
   * Compares to subtrees, using the tree depth as tie breaker when
   * the subtrees have equal frequency. This minimizes the worst case length.
   */


  var smaller = function smaller(tree, n, m, depth) {
    var _n2 = n * 2;

    var _m2 = m * 2;

    return tree[_n2]
    /*.Freq*/
    < tree[_m2]
    /*.Freq*/
    || tree[_n2]
    /*.Freq*/
    === tree[_m2]
    /*.Freq*/
    && depth[n] <= depth[m];
  };
  /* ===========================================================================
   * Restore the heap property by moving down the tree starting at node k,
   * exchanging a node with the smallest of its two sons if necessary, stopping
   * when the heap property is re-established (each father smaller than its
   * two sons).
   */


  var pqdownheap = function pqdownheap(s, tree, k) //    deflate_state *s;
  //    ct_data *tree;  /* the tree to restore */
  //    int k;               /* node to move down */
  {
    var v = s.heap[k];
    var j = k << 1;
    /* left son of k */

    while (j <= s.heap_len) {
      /* Set j to the smallest of the two sons: */
      if (j < s.heap_len && smaller(tree, s.heap[j + 1], s.heap[j], s.depth)) {
        j++;
      }
      /* Exit if v is smaller than both sons */


      if (smaller(tree, v, s.heap[j], s.depth)) {
        break;
      }
      /* Exchange v with the smallest son */


      s.heap[k] = s.heap[j];
      k = j;
      /* And continue down the tree, setting j to the left son of k */

      j <<= 1;
    }

    s.heap[k] = v;
  }; // inlined manually
  // const SMALLEST = 1;

  /* ===========================================================================
   * Send the block data compressed using the given Huffman trees
   */


  var compress_block = function compress_block(s, ltree, dtree) //    deflate_state *s;
  //    const ct_data *ltree; /* literal tree */
  //    const ct_data *dtree; /* distance tree */
  {
    var dist;
    /* distance of matched string */

    var lc;
    /* match length or unmatched char (if dist == 0) */

    var lx = 0;
    /* running index in l_buf */

    var code;
    /* the code to send */

    var extra;
    /* number of extra bits to send */

    if (s.last_lit !== 0) {
      do {
        dist = s.pending_buf[s.d_buf + lx * 2] << 8 | s.pending_buf[s.d_buf + lx * 2 + 1];
        lc = s.pending_buf[s.l_buf + lx];
        lx++;

        if (dist === 0) {
          send_code(s, lc, ltree);
          /* send a literal byte */
          //Tracecv(isgraph(lc), (stderr," '%c' ", lc));
        } else {
          /* Here, lc is the match length - MIN_MATCH */
          code = _length_code[lc];
          send_code(s, code + LITERALS$1 + 1, ltree);
          /* send the length code */

          extra = extra_lbits[code];

          if (extra !== 0) {
            lc -= base_length[code];
            send_bits(s, lc, extra);
            /* send the extra length bits */
          }

          dist--;
          /* dist is now the match distance - 1 */

          code = d_code(dist); //Assert (code < D_CODES, "bad d_code");

          send_code(s, code, dtree);
          /* send the distance code */

          extra = extra_dbits[code];

          if (extra !== 0) {
            dist -= base_dist[code];
            send_bits(s, dist, extra);
            /* send the extra distance bits */
          }
        }
        /* literal or match pair ? */

        /* Check that the overlay between pending_buf and d_buf+l_buf is ok: */
        //Assert((uInt)(s->pending) < s->lit_bufsize + 2*lx,
        //       "pendingBuf overflow");

      } while (lx < s.last_lit);
    }

    send_code(s, END_BLOCK, ltree);
  };
  /* ===========================================================================
   * Construct one Huffman tree and assigns the code bit strings and lengths.
   * Update the total bit length for the current block.
   * IN assertion: the field freq is set for all tree elements.
   * OUT assertions: the fields len and code are set to the optimal bit length
   *     and corresponding code. The length opt_len is updated; static_len is
   *     also updated if stree is not null. The field max_code is set.
   */


  var build_tree = function build_tree(s, desc) //    deflate_state *s;
  //    tree_desc *desc; /* the tree descriptor */
  {
    var tree = desc.dyn_tree;
    var stree = desc.stat_desc.static_tree;
    var has_stree = desc.stat_desc.has_stree;
    var elems = desc.stat_desc.elems;
    var n, m;
    /* iterate over heap elements */

    var max_code = -1;
    /* largest code with non zero frequency */

    var node;
    /* new node being created */

    /* Construct the initial heap, with least frequent element in
     * heap[SMALLEST]. The sons of heap[n] are heap[2*n] and heap[2*n+1].
     * heap[0] is not used.
     */

    s.heap_len = 0;
    s.heap_max = HEAP_SIZE$1;

    for (n = 0; n < elems; n++) {
      if (tree[n * 2]
      /*.Freq*/
      !== 0) {
        s.heap[++s.heap_len] = max_code = n;
        s.depth[n] = 0;
      } else {
        tree[n * 2 + 1]
        /*.Len*/
        = 0;
      }
    }
    /* The pkzip format requires that at least one distance code exists,
     * and that at least one bit should be sent even if there is only one
     * possible code. So to avoid special checks later on we force at least
     * two codes of non zero frequency.
     */


    while (s.heap_len < 2) {
      node = s.heap[++s.heap_len] = max_code < 2 ? ++max_code : 0;
      tree[node * 2]
      /*.Freq*/
      = 1;
      s.depth[node] = 0;
      s.opt_len--;

      if (has_stree) {
        s.static_len -= stree[node * 2 + 1]
        /*.Len*/
        ;
      }
      /* node is 0 or 1 so it does not have extra bits */

    }

    desc.max_code = max_code;
    /* The elements heap[heap_len/2+1 .. heap_len] are leaves of the tree,
     * establish sub-heaps of increasing lengths:
     */

    for (n = s.heap_len >> 1
    /*int /2*/
    ; n >= 1; n--) {
      pqdownheap(s, tree, n);
    }
    /* Construct the Huffman tree by repeatedly combining the least two
     * frequent nodes.
     */


    node = elems;
    /* next internal node of the tree */

    do {
      //pqremove(s, tree, n);  /* n = node of least frequency */

      /*** pqremove ***/
      n = s.heap[1
      /*SMALLEST*/
      ];
      s.heap[1
      /*SMALLEST*/
      ] = s.heap[s.heap_len--];
      pqdownheap(s, tree, 1
      /*SMALLEST*/
      );
      /***/

      m = s.heap[1
      /*SMALLEST*/
      ];
      /* m = node of next least frequency */

      s.heap[--s.heap_max] = n;
      /* keep the nodes sorted by frequency */

      s.heap[--s.heap_max] = m;
      /* Create a new node father of n and m */

      tree[node * 2]
      /*.Freq*/
      = tree[n * 2]
      /*.Freq*/
      + tree[m * 2]
      /*.Freq*/
      ;
      s.depth[node] = (s.depth[n] >= s.depth[m] ? s.depth[n] : s.depth[m]) + 1;
      tree[n * 2 + 1]
      /*.Dad*/
      = tree[m * 2 + 1]
      /*.Dad*/
      = node;
      /* and insert the new node in the heap */

      s.heap[1
      /*SMALLEST*/
      ] = node++;
      pqdownheap(s, tree, 1
      /*SMALLEST*/
      );
    } while (s.heap_len >= 2);

    s.heap[--s.heap_max] = s.heap[1
    /*SMALLEST*/
    ];
    /* At this point, the fields freq and dad are set. We can now
     * generate the bit lengths.
     */

    gen_bitlen(s, desc);
    /* The field len is now set, we can generate the bit codes */

    gen_codes(tree, max_code, s.bl_count);
  };
  /* ===========================================================================
   * Scan a literal or distance tree to determine the frequencies of the codes
   * in the bit length tree.
   */


  var scan_tree = function scan_tree(s, tree, max_code) //    deflate_state *s;
  //    ct_data *tree;   /* the tree to be scanned */
  //    int max_code;    /* and its largest code of non zero frequency */
  {
    var n;
    /* iterates over all tree elements */

    var prevlen = -1;
    /* last emitted length */

    var curlen;
    /* length of current code */

    var nextlen = tree[0 * 2 + 1]
    /*.Len*/
    ;
    /* length of next code */

    var count = 0;
    /* repeat count of the current code */

    var max_count = 7;
    /* max repeat count */

    var min_count = 4;
    /* min repeat count */

    if (nextlen === 0) {
      max_count = 138;
      min_count = 3;
    }

    tree[(max_code + 1) * 2 + 1]
    /*.Len*/
    = 0xffff;
    /* guard */

    for (n = 0; n <= max_code; n++) {
      curlen = nextlen;
      nextlen = tree[(n + 1) * 2 + 1]
      /*.Len*/
      ;

      if (++count < max_count && curlen === nextlen) {
        continue;
      } else if (count < min_count) {
        s.bl_tree[curlen * 2]
        /*.Freq*/
        += count;
      } else if (curlen !== 0) {
        if (curlen !== prevlen) {
          s.bl_tree[curlen * 2] /*.Freq*/++;
        }

        s.bl_tree[REP_3_6 * 2] /*.Freq*/++;
      } else if (count <= 10) {
        s.bl_tree[REPZ_3_10 * 2] /*.Freq*/++;
      } else {
        s.bl_tree[REPZ_11_138 * 2] /*.Freq*/++;
      }

      count = 0;
      prevlen = curlen;

      if (nextlen === 0) {
        max_count = 138;
        min_count = 3;
      } else if (curlen === nextlen) {
        max_count = 6;
        min_count = 3;
      } else {
        max_count = 7;
        min_count = 4;
      }
    }
  };
  /* ===========================================================================
   * Send a literal or distance tree in compressed form, using the codes in
   * bl_tree.
   */


  var send_tree = function send_tree(s, tree, max_code) //    deflate_state *s;
  //    ct_data *tree; /* the tree to be scanned */
  //    int max_code;       /* and its largest code of non zero frequency */
  {
    var n;
    /* iterates over all tree elements */

    var prevlen = -1;
    /* last emitted length */

    var curlen;
    /* length of current code */

    var nextlen = tree[0 * 2 + 1]
    /*.Len*/
    ;
    /* length of next code */

    var count = 0;
    /* repeat count of the current code */

    var max_count = 7;
    /* max repeat count */

    var min_count = 4;
    /* min repeat count */

    /* tree[max_code+1].Len = -1; */

    /* guard already set */

    if (nextlen === 0) {
      max_count = 138;
      min_count = 3;
    }

    for (n = 0; n <= max_code; n++) {
      curlen = nextlen;
      nextlen = tree[(n + 1) * 2 + 1]
      /*.Len*/
      ;

      if (++count < max_count && curlen === nextlen) {
        continue;
      } else if (count < min_count) {
        do {
          send_code(s, curlen, s.bl_tree);
        } while (--count !== 0);
      } else if (curlen !== 0) {
        if (curlen !== prevlen) {
          send_code(s, curlen, s.bl_tree);
          count--;
        } //Assert(count >= 3 && count <= 6, " 3_6?");


        send_code(s, REP_3_6, s.bl_tree);
        send_bits(s, count - 3, 2);
      } else if (count <= 10) {
        send_code(s, REPZ_3_10, s.bl_tree);
        send_bits(s, count - 3, 3);
      } else {
        send_code(s, REPZ_11_138, s.bl_tree);
        send_bits(s, count - 11, 7);
      }

      count = 0;
      prevlen = curlen;

      if (nextlen === 0) {
        max_count = 138;
        min_count = 3;
      } else if (curlen === nextlen) {
        max_count = 6;
        min_count = 3;
      } else {
        max_count = 7;
        min_count = 4;
      }
    }
  };
  /* ===========================================================================
   * Construct the Huffman tree for the bit lengths and return the index in
   * bl_order of the last bit length code to send.
   */


  var build_bl_tree = function build_bl_tree(s) {
    var max_blindex;
    /* index of last bit length code of non zero freq */

    /* Determine the bit length frequencies for literal and distance trees */

    scan_tree(s, s.dyn_ltree, s.l_desc.max_code);
    scan_tree(s, s.dyn_dtree, s.d_desc.max_code);
    /* Build the bit length tree: */

    build_tree(s, s.bl_desc);
    /* opt_len now includes the length of the tree representations, except
     * the lengths of the bit lengths codes and the 5+5+4 bits for the counts.
     */

    /* Determine the number of bit length codes to send. The pkzip format
     * requires that at least 4 bit length codes be sent. (appnote.txt says
     * 3 but the actual value used is 4.)
     */

    for (max_blindex = BL_CODES$1 - 1; max_blindex >= 3; max_blindex--) {
      if (s.bl_tree[bl_order[max_blindex] * 2 + 1]
      /*.Len*/
      !== 0) {
        break;
      }
    }
    /* Update opt_len to include the bit length tree and counts */


    s.opt_len += 3 * (max_blindex + 1) + 5 + 5 + 4; //Tracev((stderr, "\ndyn trees: dyn %ld, stat %ld",
    //        s->opt_len, s->static_len));

    return max_blindex;
  };
  /* ===========================================================================
   * Send the header for a block using dynamic Huffman trees: the counts, the
   * lengths of the bit length codes, the literal tree and the distance tree.
   * IN assertion: lcodes >= 257, dcodes >= 1, blcodes >= 4.
   */


  var send_all_trees = function send_all_trees(s, lcodes, dcodes, blcodes) //    deflate_state *s;
  //    int lcodes, dcodes, blcodes; /* number of codes for each tree */
  {
    var rank;
    /* index in bl_order */
    //Assert (lcodes >= 257 && dcodes >= 1 && blcodes >= 4, "not enough codes");
    //Assert (lcodes <= L_CODES && dcodes <= D_CODES && blcodes <= BL_CODES,
    //        "too many codes");
    //Tracev((stderr, "\nbl counts: "));

    send_bits(s, lcodes - 257, 5);
    /* not +255 as stated in appnote.txt */

    send_bits(s, dcodes - 1, 5);
    send_bits(s, blcodes - 4, 4);
    /* not -3 as stated in appnote.txt */

    for (rank = 0; rank < blcodes; rank++) {
      //Tracev((stderr, "\nbl code %2d ", bl_order[rank]));
      send_bits(s, s.bl_tree[bl_order[rank] * 2 + 1]
      /*.Len*/
      , 3);
    } //Tracev((stderr, "\nbl tree: sent %ld", s->bits_sent));


    send_tree(s, s.dyn_ltree, lcodes - 1);
    /* literal tree */
    //Tracev((stderr, "\nlit tree: sent %ld", s->bits_sent));

    send_tree(s, s.dyn_dtree, dcodes - 1);
    /* distance tree */
    //Tracev((stderr, "\ndist tree: sent %ld", s->bits_sent));
  };
  /* ===========================================================================
   * Check if the data type is TEXT or BINARY, using the following algorithm:
   * - TEXT if the two conditions below are satisfied:
   *    a) There are no non-portable control characters belonging to the
   *       "black list" (0..6, 14..25, 28..31).
   *    b) There is at least one printable character belonging to the
   *       "white list" (9 {TAB}, 10 {LF}, 13 {CR}, 32..255).
   * - BINARY otherwise.
   * - The following partially-portable control characters form a
   *   "gray list" that is ignored in this detection algorithm:
   *   (7 {BEL}, 8 {BS}, 11 {VT}, 12 {FF}, 26 {SUB}, 27 {ESC}).
   * IN assertion: the fields Freq of dyn_ltree are set.
   */


  var detect_data_type = function detect_data_type(s) {
    /* black_mask is the bit mask of black-listed bytes
     * set bits 0..6, 14..25, and 28..31
     * 0xf3ffc07f = binary 11110011111111111100000001111111
     */
    var black_mask = 0xf3ffc07f;
    var n;
    /* Check for non-textual ("black-listed") bytes. */

    for (n = 0; n <= 31; n++, black_mask >>>= 1) {
      if (black_mask & 1 && s.dyn_ltree[n * 2]
      /*.Freq*/
      !== 0) {
        return Z_BINARY;
      }
    }
    /* Check for textual ("white-listed") bytes. */


    if (s.dyn_ltree[9 * 2]
    /*.Freq*/
    !== 0 || s.dyn_ltree[10 * 2]
    /*.Freq*/
    !== 0 || s.dyn_ltree[13 * 2]
    /*.Freq*/
    !== 0) {
      return Z_TEXT;
    }

    for (n = 32; n < LITERALS$1; n++) {
      if (s.dyn_ltree[n * 2]
      /*.Freq*/
      !== 0) {
        return Z_TEXT;
      }
    }
    /* There are no "black-listed" or "white-listed" bytes:
     * this stream either is empty or has tolerated ("gray-listed") bytes only.
     */


    return Z_BINARY;
  };

  var static_init_done = false;
  /* ===========================================================================
   * Initialize the tree data structures for a new zlib stream.
   */

  var _tr_init$1 = function _tr_init(s) {
    if (!static_init_done) {
      tr_static_init();
      static_init_done = true;
    }

    s.l_desc = new TreeDesc(s.dyn_ltree, static_l_desc);
    s.d_desc = new TreeDesc(s.dyn_dtree, static_d_desc);
    s.bl_desc = new TreeDesc(s.bl_tree, static_bl_desc);
    s.bi_buf = 0;
    s.bi_valid = 0;
    /* Initialize the first block of the first file: */

    init_block(s);
  };
  /* ===========================================================================
   * Send a stored block
   */


  var _tr_stored_block$1 = function _tr_stored_block(s, buf, stored_len, last) //DeflateState *s;
  //charf *buf;       /* input block */
  //ulg stored_len;   /* length of input block */
  //int last;         /* one if this is the last block for a file */
  {
    send_bits(s, (STORED_BLOCK << 1) + (last ? 1 : 0), 3);
    /* send block type */

    copy_block(s, buf, stored_len, true);
    /* with header */
  };
  /* ===========================================================================
   * Send one empty static block to give enough lookahead for inflate.
   * This takes 10 bits, of which 7 may remain in the bit buffer.
   */


  var _tr_align$1 = function _tr_align(s) {
    send_bits(s, STATIC_TREES << 1, 3);
    send_code(s, END_BLOCK, static_ltree);
    bi_flush(s);
  };
  /* ===========================================================================
   * Determine the best encoding for the current block: dynamic trees, static
   * trees or store, and output the encoded block to the zip file.
   */


  var _tr_flush_block$1 = function _tr_flush_block(s, buf, stored_len, last) //DeflateState *s;
  //charf *buf;       /* input block, or NULL if too old */
  //ulg stored_len;   /* length of input block */
  //int last;         /* one if this is the last block for a file */
  {
    var opt_lenb, static_lenb;
    /* opt_len and static_len in bytes */

    var max_blindex = 0;
    /* index of last bit length code of non zero freq */

    /* Build the Huffman trees unless a stored block is forced */

    if (s.level > 0) {
      /* Check if the file is binary or text */
      if (s.strm.data_type === Z_UNKNOWN$1) {
        s.strm.data_type = detect_data_type(s);
      }
      /* Construct the literal and distance trees */


      build_tree(s, s.l_desc); // Tracev((stderr, "\nlit data: dyn %ld, stat %ld", s->opt_len,
      //        s->static_len));

      build_tree(s, s.d_desc); // Tracev((stderr, "\ndist data: dyn %ld, stat %ld", s->opt_len,
      //        s->static_len));

      /* At this point, opt_len and static_len are the total bit lengths of
       * the compressed block data, excluding the tree representations.
       */

      /* Build the bit length tree for the above two trees, and get the index
       * in bl_order of the last bit length code to send.
       */

      max_blindex = build_bl_tree(s);
      /* Determine the best encoding. Compute the block lengths in bytes. */

      opt_lenb = s.opt_len + 3 + 7 >>> 3;
      static_lenb = s.static_len + 3 + 7 >>> 3; // Tracev((stderr, "\nopt %lu(%lu) stat %lu(%lu) stored %lu lit %u ",
      //        opt_lenb, s->opt_len, static_lenb, s->static_len, stored_len,
      //        s->last_lit));

      if (static_lenb <= opt_lenb) {
        opt_lenb = static_lenb;
      }
    } else {
      // Assert(buf != (char*)0, "lost buf");
      opt_lenb = static_lenb = stored_len + 5;
      /* force a stored block */
    }

    if (stored_len + 4 <= opt_lenb && buf !== -1) {
      /* 4: two words for the lengths */

      /* The test buf != NULL is only necessary if LIT_BUFSIZE > WSIZE.
       * Otherwise we can't have processed more than WSIZE input bytes since
       * the last block flush, because compression would have been
       * successful. If LIT_BUFSIZE <= WSIZE, it is never too late to
       * transform a block into a stored block.
       */
      _tr_stored_block$1(s, buf, stored_len, last);
    } else if (s.strategy === Z_FIXED$1 || static_lenb === opt_lenb) {
      send_bits(s, (STATIC_TREES << 1) + (last ? 1 : 0), 3);
      compress_block(s, static_ltree, static_dtree);
    } else {
      send_bits(s, (DYN_TREES << 1) + (last ? 1 : 0), 3);
      send_all_trees(s, s.l_desc.max_code + 1, s.d_desc.max_code + 1, max_blindex + 1);
      compress_block(s, s.dyn_ltree, s.dyn_dtree);
    } // Assert (s->compressed_len == s->bits_sent, "bad compressed size");

    /* The above check is made mod 2^32, for files larger than 512 MB
     * and uLong implemented on 32 bits.
     */


    init_block(s);

    if (last) {
      bi_windup(s);
    } // Tracev((stderr,"\ncomprlen %lu(%lu) ", s->compressed_len>>3,
    //       s->compressed_len-7*last));

  };
  /* ===========================================================================
   * Save the match info and tally the frequency counts. Return true if
   * the current block must be flushed.
   */


  var _tr_tally$1 = function _tr_tally(s, dist, lc) //    deflate_state *s;
  //    unsigned dist;  /* distance of matched string */
  //    unsigned lc;    /* match length-MIN_MATCH or unmatched char (if dist==0) */
  {
    //let out_length, in_length, dcode;
    s.pending_buf[s.d_buf + s.last_lit * 2] = dist >>> 8 & 0xff;
    s.pending_buf[s.d_buf + s.last_lit * 2 + 1] = dist & 0xff;
    s.pending_buf[s.l_buf + s.last_lit] = lc & 0xff;
    s.last_lit++;

    if (dist === 0) {
      /* lc is the unmatched char */
      s.dyn_ltree[lc * 2] /*.Freq*/++;
    } else {
      s.matches++;
      /* Here, lc is the match length - MIN_MATCH */

      dist--;
      /* dist = match distance - 1 */
      //Assert((ush)dist < (ush)MAX_DIST(s) &&
      //       (ush)lc <= (ush)(MAX_MATCH-MIN_MATCH) &&
      //       (ush)d_code(dist) < (ush)D_CODES,  "_tr_tally: bad match");

      s.dyn_ltree[(_length_code[lc] + LITERALS$1 + 1) * 2] /*.Freq*/++;
      s.dyn_dtree[d_code(dist) * 2] /*.Freq*/++;
    } // (!) This block is disabled in zlib defaults,
    // don't enable it for binary compatibility
    //#ifdef TRUNCATE_BLOCK
    //  /* Try to guess if it is profitable to stop the current block here */
    //  if ((s.last_lit & 0x1fff) === 0 && s.level > 2) {
    //    /* Compute an upper bound for the compressed length */
    //    out_length = s.last_lit*8;
    //    in_length = s.strstart - s.block_start;
    //
    //    for (dcode = 0; dcode < D_CODES; dcode++) {
    //      out_length += s.dyn_dtree[dcode*2]/*.Freq*/ * (5 + extra_dbits[dcode]);
    //    }
    //    out_length >>>= 3;
    //    //Tracev((stderr,"\nlast_lit %u, in %ld, out ~%ld(%ld%%) ",
    //    //       s->last_lit, in_length, out_length,
    //    //       100L - out_length*100L/in_length));
    //    if (s.matches < (s.last_lit>>1)/*int /2*/ && out_length < (in_length>>1)/*int /2*/) {
    //      return true;
    //    }
    //  }
    //#endif


    return s.last_lit === s.lit_bufsize - 1;
    /* We avoid equality with lit_bufsize because of wraparound at 64K
     * on 16 bit machines and because stored blocks are restricted to
     * 64K-1 bytes.
     */
  };

  var _tr_init_1 = _tr_init$1;
  var _tr_stored_block_1 = _tr_stored_block$1;
  var _tr_flush_block_1 = _tr_flush_block$1;
  var _tr_tally_1 = _tr_tally$1;
  var _tr_align_1 = _tr_align$1;
  var trees = {
    _tr_init: _tr_init_1,
    _tr_stored_block: _tr_stored_block_1,
    _tr_flush_block: _tr_flush_block_1,
    _tr_tally: _tr_tally_1,
    _tr_align: _tr_align_1
  };

  // It isn't worth it to make additional optimizations as in original.
  // Small size is preferable.
  // (C) 1995-2013 Jean-loup Gailly and Mark Adler
  // (C) 2014-2017 Vitaly Puzrin and Andrey Tupitsin
  //
  // This software is provided 'as-is', without any express or implied
  // warranty. In no event will the authors be held liable for any damages
  // arising from the use of this software.
  //
  // Permission is granted to anyone to use this software for any purpose,
  // including commercial applications, and to alter it and redistribute it
  // freely, subject to the following restrictions:
  //
  // 1. The origin of this software must not be misrepresented; you must not
  //   claim that you wrote the original software. If you use this software
  //   in a product, an acknowledgment in the product documentation would be
  //   appreciated but is not required.
  // 2. Altered source versions must be plainly marked as such, and must not be
  //   misrepresented as being the original software.
  // 3. This notice may not be removed or altered from any source distribution.

  var adler32 = function adler32(adler, buf, len, pos) {
    var s1 = adler & 0xffff | 0,
        s2 = adler >>> 16 & 0xffff | 0,
        n = 0;

    while (len !== 0) {
      // Set limit ~ twice less than 5552, to keep
      // s2 in 31-bits, because we force signed ints.
      // in other case %= will fail.
      n = len > 2000 ? 2000 : len;
      len -= n;

      do {
        s1 = s1 + buf[pos++] | 0;
        s2 = s2 + s1 | 0;
      } while (--n);

      s1 %= 65521;
      s2 %= 65521;
    }

    return s1 | s2 << 16 | 0;
  };

  var adler32_1 = adler32;

  // So write code to minimize size - no pregenerated tables
  // and array tools dependencies.
  // (C) 1995-2013 Jean-loup Gailly and Mark Adler
  // (C) 2014-2017 Vitaly Puzrin and Andrey Tupitsin
  //
  // This software is provided 'as-is', without any express or implied
  // warranty. In no event will the authors be held liable for any damages
  // arising from the use of this software.
  //
  // Permission is granted to anyone to use this software for any purpose,
  // including commercial applications, and to alter it and redistribute it
  // freely, subject to the following restrictions:
  //
  // 1. The origin of this software must not be misrepresented; you must not
  //   claim that you wrote the original software. If you use this software
  //   in a product, an acknowledgment in the product documentation would be
  //   appreciated but is not required.
  // 2. Altered source versions must be plainly marked as such, and must not be
  //   misrepresented as being the original software.
  // 3. This notice may not be removed or altered from any source distribution.
  // Use ordinary array, since untyped makes no boost here

  var makeTable = function makeTable() {
    var c,
        table = [];

    for (var n = 0; n < 256; n++) {
      c = n;

      for (var k = 0; k < 8; k++) {
        c = c & 1 ? 0xEDB88320 ^ c >>> 1 : c >>> 1;
      }

      table[n] = c;
    }

    return table;
  }; // Create table on load. Just 255 signed longs. Not a problem.


  var crcTable = new Uint32Array(makeTable());

  var crc32 = function crc32(crc, buf, len, pos) {
    var t = crcTable;
    var end = pos + len;
    crc ^= -1;

    for (var i = pos; i < end; i++) {
      crc = crc >>> 8 ^ t[(crc ^ buf[i]) & 0xFF];
    }

    return crc ^ -1; // >>> 0;
  };

  var crc32_1 = crc32;

  // (C) 2014-2017 Vitaly Puzrin and Andrey Tupitsin
  //
  // This software is provided 'as-is', without any express or implied
  // warranty. In no event will the authors be held liable for any damages
  // arising from the use of this software.
  //
  // Permission is granted to anyone to use this software for any purpose,
  // including commercial applications, and to alter it and redistribute it
  // freely, subject to the following restrictions:
  //
  // 1. The origin of this software must not be misrepresented; you must not
  //   claim that you wrote the original software. If you use this software
  //   in a product, an acknowledgment in the product documentation would be
  //   appreciated but is not required.
  // 2. Altered source versions must be plainly marked as such, and must not be
  //   misrepresented as being the original software.
  // 3. This notice may not be removed or altered from any source distribution.

  var messages = {
    2: 'need dictionary',

    /* Z_NEED_DICT       2  */
    1: 'stream end',

    /* Z_STREAM_END      1  */
    0: '',

    /* Z_OK              0  */
    '-1': 'file error',

    /* Z_ERRNO         (-1) */
    '-2': 'stream error',

    /* Z_STREAM_ERROR  (-2) */
    '-3': 'data error',

    /* Z_DATA_ERROR    (-3) */
    '-4': 'insufficient memory',

    /* Z_MEM_ERROR     (-4) */
    '-5': 'buffer error',

    /* Z_BUF_ERROR     (-5) */
    '-6': 'incompatible version'
    /* Z_VERSION_ERROR (-6) */

  };

  // (C) 2014-2017 Vitaly Puzrin and Andrey Tupitsin
  //
  // This software is provided 'as-is', without any express or implied
  // warranty. In no event will the authors be held liable for any damages
  // arising from the use of this software.
  //
  // Permission is granted to anyone to use this software for any purpose,
  // including commercial applications, and to alter it and redistribute it
  // freely, subject to the following restrictions:
  //
  // 1. The origin of this software must not be misrepresented; you must not
  //   claim that you wrote the original software. If you use this software
  //   in a product, an acknowledgment in the product documentation would be
  //   appreciated but is not required.
  // 2. Altered source versions must be plainly marked as such, and must not be
  //   misrepresented as being the original software.
  // 3. This notice may not be removed or altered from any source distribution.

  var constants$2 = {
    /* Allowed flush values; see deflate() and inflate() below for details */
    Z_NO_FLUSH: 0,
    Z_PARTIAL_FLUSH: 1,
    Z_SYNC_FLUSH: 2,
    Z_FULL_FLUSH: 3,
    Z_FINISH: 4,
    Z_BLOCK: 5,
    Z_TREES: 6,

    /* Return codes for the compression/decompression functions. Negative values
    * are errors, positive values are used for special but normal events.
    */
    Z_OK: 0,
    Z_STREAM_END: 1,
    Z_NEED_DICT: 2,
    Z_ERRNO: -1,
    Z_STREAM_ERROR: -2,
    Z_DATA_ERROR: -3,
    Z_MEM_ERROR: -4,
    Z_BUF_ERROR: -5,
    //Z_VERSION_ERROR: -6,

    /* compression levels */
    Z_NO_COMPRESSION: 0,
    Z_BEST_SPEED: 1,
    Z_BEST_COMPRESSION: 9,
    Z_DEFAULT_COMPRESSION: -1,
    Z_FILTERED: 1,
    Z_HUFFMAN_ONLY: 2,
    Z_RLE: 3,
    Z_FIXED: 4,
    Z_DEFAULT_STRATEGY: 0,

    /* Possible values of the data_type field (though see inflate()) */
    Z_BINARY: 0,
    Z_TEXT: 1,
    //Z_ASCII:                1, // = Z_TEXT (deprecated)
    Z_UNKNOWN: 2,

    /* The deflate compression method */
    Z_DEFLATED: 8 //Z_NULL:                 null // Use -1 or null inline, depending on var type

  };

  // (C) 2014-2017 Vitaly Puzrin and Andrey Tupitsin
  //
  // This software is provided 'as-is', without any express or implied
  // warranty. In no event will the authors be held liable for any damages
  // arising from the use of this software.
  //
  // Permission is granted to anyone to use this software for any purpose,
  // including commercial applications, and to alter it and redistribute it
  // freely, subject to the following restrictions:
  //
  // 1. The origin of this software must not be misrepresented; you must not
  //   claim that you wrote the original software. If you use this software
  //   in a product, an acknowledgment in the product documentation would be
  //   appreciated but is not required.
  // 2. Altered source versions must be plainly marked as such, and must not be
  //   misrepresented as being the original software.
  // 3. This notice may not be removed or altered from any source distribution.


  var _tr_init = trees._tr_init,
      _tr_stored_block = trees._tr_stored_block,
      _tr_flush_block = trees._tr_flush_block,
      _tr_tally = trees._tr_tally,
      _tr_align = trees._tr_align;
  /* Public constants ==========================================================*/

  /* ===========================================================================*/

  var Z_NO_FLUSH$2 = constants$2.Z_NO_FLUSH,
      Z_PARTIAL_FLUSH = constants$2.Z_PARTIAL_FLUSH,
      Z_FULL_FLUSH$1 = constants$2.Z_FULL_FLUSH,
      Z_FINISH$3 = constants$2.Z_FINISH,
      Z_BLOCK$1 = constants$2.Z_BLOCK,
      Z_OK$3 = constants$2.Z_OK,
      Z_STREAM_END$3 = constants$2.Z_STREAM_END,
      Z_STREAM_ERROR$2 = constants$2.Z_STREAM_ERROR,
      Z_DATA_ERROR$2 = constants$2.Z_DATA_ERROR,
      Z_BUF_ERROR$1 = constants$2.Z_BUF_ERROR,
      Z_DEFAULT_COMPRESSION$1 = constants$2.Z_DEFAULT_COMPRESSION,
      Z_FILTERED = constants$2.Z_FILTERED,
      Z_HUFFMAN_ONLY = constants$2.Z_HUFFMAN_ONLY,
      Z_RLE = constants$2.Z_RLE,
      Z_FIXED = constants$2.Z_FIXED,
      Z_DEFAULT_STRATEGY$1 = constants$2.Z_DEFAULT_STRATEGY,
      Z_UNKNOWN = constants$2.Z_UNKNOWN,
      Z_DEFLATED$2 = constants$2.Z_DEFLATED;
  /*============================================================================*/

  var MAX_MEM_LEVEL = 9;
  /* Maximum value for memLevel in deflateInit2 */

  var MAX_WBITS$1 = 15;
  /* 32K LZ77 window */

  var DEF_MEM_LEVEL = 8;
  var LENGTH_CODES = 29;
  /* number of length codes, not counting the special END_BLOCK code */

  var LITERALS = 256;
  /* number of literal bytes 0..255 */

  var L_CODES = LITERALS + 1 + LENGTH_CODES;
  /* number of Literal or Length codes, including the END_BLOCK code */

  var D_CODES = 30;
  /* number of distance codes */

  var BL_CODES = 19;
  /* number of codes used to transfer the bit lengths */

  var HEAP_SIZE = 2 * L_CODES + 1;
  /* maximum heap size */

  var MAX_BITS = 15;
  /* All codes must not exceed MAX_BITS bits */

  var MIN_MATCH = 3;
  var MAX_MATCH = 258;
  var MIN_LOOKAHEAD = MAX_MATCH + MIN_MATCH + 1;
  var PRESET_DICT = 0x20;
  var INIT_STATE = 42;
  var EXTRA_STATE = 69;
  var NAME_STATE = 73;
  var COMMENT_STATE = 91;
  var HCRC_STATE = 103;
  var BUSY_STATE = 113;
  var FINISH_STATE = 666;
  var BS_NEED_MORE = 1;
  /* block not completed, need more input or more output */

  var BS_BLOCK_DONE = 2;
  /* block flush performed */

  var BS_FINISH_STARTED = 3;
  /* finish started, need only more output at next deflate */

  var BS_FINISH_DONE = 4;
  /* finish done, accept no more input or output */

  var OS_CODE = 0x03; // Unix :) . Don't detect, use this default.

  var err = function err(strm, errorCode) {
    strm.msg = messages[errorCode];
    return errorCode;
  };

  var rank = function rank(f) {
    return (f << 1) - (f > 4 ? 9 : 0);
  };

  var zero = function zero(buf) {
    var len = buf.length;

    while (--len >= 0) {
      buf[len] = 0;
    }
  };
  /* eslint-disable new-cap */


  var HASH_ZLIB = function HASH_ZLIB(s, prev, data) {
    return (prev << s.hash_shift ^ data) & s.hash_mask;
  }; // This hash causes less collisions, https://github.com/nodeca/pako/issues/135
  // But breaks binary compatibility
  //let HASH_FAST = (s, prev, data) => ((prev << 8) + (prev >> 8) + (data << 4)) & s.hash_mask;


  var HASH = HASH_ZLIB;
  /* =========================================================================
   * Flush as much pending output as possible. All deflate() output goes
   * through this function so some applications may wish to modify it
   * to avoid allocating a large strm->output buffer and copying into it.
   * (See also read_buf()).
   */

  var flush_pending = function flush_pending(strm) {
    var s = strm.state; //_tr_flush_bits(s);

    var len = s.pending;

    if (len > strm.avail_out) {
      len = strm.avail_out;
    }

    if (len === 0) {
      return;
    }

    strm.output.set(s.pending_buf.subarray(s.pending_out, s.pending_out + len), strm.next_out);
    strm.next_out += len;
    s.pending_out += len;
    strm.total_out += len;
    strm.avail_out -= len;
    s.pending -= len;

    if (s.pending === 0) {
      s.pending_out = 0;
    }
  };

  var flush_block_only = function flush_block_only(s, last) {
    _tr_flush_block(s, s.block_start >= 0 ? s.block_start : -1, s.strstart - s.block_start, last);

    s.block_start = s.strstart;
    flush_pending(s.strm);
  };

  var put_byte = function put_byte(s, b) {
    s.pending_buf[s.pending++] = b;
  };
  /* =========================================================================
   * Put a short in the pending buffer. The 16-bit value is put in MSB order.
   * IN assertion: the stream state is correct and there is enough room in
   * pending_buf.
   */


  var putShortMSB = function putShortMSB(s, b) {
    //  put_byte(s, (Byte)(b >> 8));
    //  put_byte(s, (Byte)(b & 0xff));
    s.pending_buf[s.pending++] = b >>> 8 & 0xff;
    s.pending_buf[s.pending++] = b & 0xff;
  };
  /* ===========================================================================
   * Read a new buffer from the current input stream, update the adler32
   * and total number of bytes read.  All deflate() input goes through
   * this function so some applications may wish to modify it to avoid
   * allocating a large strm->input buffer and copying from it.
   * (See also flush_pending()).
   */


  var read_buf = function read_buf(strm, buf, start, size) {
    var len = strm.avail_in;

    if (len > size) {
      len = size;
    }

    if (len === 0) {
      return 0;
    }

    strm.avail_in -= len; // zmemcpy(buf, strm->next_in, len);

    buf.set(strm.input.subarray(strm.next_in, strm.next_in + len), start);

    if (strm.state.wrap === 1) {
      strm.adler = adler32_1(strm.adler, buf, len, start);
    } else if (strm.state.wrap === 2) {
      strm.adler = crc32_1(strm.adler, buf, len, start);
    }

    strm.next_in += len;
    strm.total_in += len;
    return len;
  };
  /* ===========================================================================
   * Set match_start to the longest match starting at the given string and
   * return its length. Matches shorter or equal to prev_length are discarded,
   * in which case the result is equal to prev_length and match_start is
   * garbage.
   * IN assertions: cur_match is the head of the hash chain for the current
   *   string (strstart) and its distance is <= MAX_DIST, and prev_length >= 1
   * OUT assertion: the match length is not greater than s->lookahead.
   */


  var longest_match = function longest_match(s, cur_match) {
    var chain_length = s.max_chain_length;
    /* max hash chain length */

    var scan = s.strstart;
    /* current string */

    var match;
    /* matched string */

    var len;
    /* length of current match */

    var best_len = s.prev_length;
    /* best match length so far */

    var nice_match = s.nice_match;
    /* stop if match long enough */

    var limit = s.strstart > s.w_size - MIN_LOOKAHEAD ? s.strstart - (s.w_size - MIN_LOOKAHEAD) : 0
    /*NIL*/
    ;
    var _win = s.window; // shortcut

    var wmask = s.w_mask;
    var prev = s.prev;
    /* Stop when cur_match becomes <= limit. To simplify the code,
     * we prevent matches with the string of window index 0.
     */

    var strend = s.strstart + MAX_MATCH;
    var scan_end1 = _win[scan + best_len - 1];
    var scan_end = _win[scan + best_len];
    /* The code is optimized for HASH_BITS >= 8 and MAX_MATCH-2 multiple of 16.
     * It is easy to get rid of this optimization if necessary.
     */
    // Assert(s->hash_bits >= 8 && MAX_MATCH == 258, "Code too clever");

    /* Do not waste too much time if we already have a good match: */

    if (s.prev_length >= s.good_match) {
      chain_length >>= 2;
    }
    /* Do not look for matches beyond the end of the input. This is necessary
     * to make deflate deterministic.
     */


    if (nice_match > s.lookahead) {
      nice_match = s.lookahead;
    } // Assert((ulg)s->strstart <= s->window_size-MIN_LOOKAHEAD, "need lookahead");


    do {
      // Assert(cur_match < s->strstart, "no future");
      match = cur_match;
      /* Skip to next match if the match length cannot increase
       * or if the match length is less than 2.  Note that the checks below
       * for insufficient lookahead only occur occasionally for performance
       * reasons.  Therefore uninitialized memory will be accessed, and
       * conditional jumps will be made that depend on those values.
       * However the length of the match is limited to the lookahead, so
       * the output of deflate is not affected by the uninitialized values.
       */

      if (_win[match + best_len] !== scan_end || _win[match + best_len - 1] !== scan_end1 || _win[match] !== _win[scan] || _win[++match] !== _win[scan + 1]) {
        continue;
      }
      /* The check at best_len-1 can be removed because it will be made
       * again later. (This heuristic is not always a win.)
       * It is not necessary to compare scan[2] and match[2] since they
       * are always equal when the other bytes match, given that
       * the hash keys are equal and that HASH_BITS >= 8.
       */


      scan += 2;
      match++; // Assert(*scan == *match, "match[2]?");

      /* We check for insufficient lookahead only every 8th comparison;
       * the 256th check will be made at strstart+258.
       */

      do {
        /*jshint noempty:false*/
      } while (_win[++scan] === _win[++match] && _win[++scan] === _win[++match] && _win[++scan] === _win[++match] && _win[++scan] === _win[++match] && _win[++scan] === _win[++match] && _win[++scan] === _win[++match] && _win[++scan] === _win[++match] && _win[++scan] === _win[++match] && scan < strend); // Assert(scan <= s->window+(unsigned)(s->window_size-1), "wild scan");


      len = MAX_MATCH - (strend - scan);
      scan = strend - MAX_MATCH;

      if (len > best_len) {
        s.match_start = cur_match;
        best_len = len;

        if (len >= nice_match) {
          break;
        }

        scan_end1 = _win[scan + best_len - 1];
        scan_end = _win[scan + best_len];
      }
    } while ((cur_match = prev[cur_match & wmask]) > limit && --chain_length !== 0);

    if (best_len <= s.lookahead) {
      return best_len;
    }

    return s.lookahead;
  };
  /* ===========================================================================
   * Fill the window when the lookahead becomes insufficient.
   * Updates strstart and lookahead.
   *
   * IN assertion: lookahead < MIN_LOOKAHEAD
   * OUT assertions: strstart <= window_size-MIN_LOOKAHEAD
   *    At least one byte has been read, or avail_in == 0; reads are
   *    performed for at least two bytes (required for the zip translate_eol
   *    option -- not supported here).
   */


  var fill_window = function fill_window(s) {
    var _w_size = s.w_size;
    var p, n, m, more, str; //Assert(s->lookahead < MIN_LOOKAHEAD, "already enough lookahead");

    do {
      more = s.window_size - s.lookahead - s.strstart; // JS ints have 32 bit, block below not needed

      /* Deal with !@#$% 64K limit: */
      //if (sizeof(int) <= 2) {
      //    if (more == 0 && s->strstart == 0 && s->lookahead == 0) {
      //        more = wsize;
      //
      //  } else if (more == (unsigned)(-1)) {
      //        /* Very unlikely, but possible on 16 bit machine if
      //         * strstart == 0 && lookahead == 1 (input done a byte at time)
      //         */
      //        more--;
      //    }
      //}

      /* If the window is almost full and there is insufficient lookahead,
       * move the upper half to the lower one to make room in the upper half.
       */

      if (s.strstart >= _w_size + (_w_size - MIN_LOOKAHEAD)) {
        s.window.set(s.window.subarray(_w_size, _w_size + _w_size), 0);
        s.match_start -= _w_size;
        s.strstart -= _w_size;
        /* we now have strstart >= MAX_DIST */

        s.block_start -= _w_size;
        /* Slide the hash table (could be avoided with 32 bit values
         at the expense of memory usage). We slide even when level == 0
         to keep the hash table consistent if we switch back to level > 0
         later. (Using level 0 permanently is not an optimal usage of
         zlib, so we don't care about this pathological case.)
         */

        n = s.hash_size;
        p = n;

        do {
          m = s.head[--p];
          s.head[p] = m >= _w_size ? m - _w_size : 0;
        } while (--n);

        n = _w_size;
        p = n;

        do {
          m = s.prev[--p];
          s.prev[p] = m >= _w_size ? m - _w_size : 0;
          /* If n is not on any hash chain, prev[n] is garbage but
           * its value will never be used.
           */
        } while (--n);

        more += _w_size;
      }

      if (s.strm.avail_in === 0) {
        break;
      }
      /* If there was no sliding:
       *    strstart <= WSIZE+MAX_DIST-1 && lookahead <= MIN_LOOKAHEAD - 1 &&
       *    more == window_size - lookahead - strstart
       * => more >= window_size - (MIN_LOOKAHEAD-1 + WSIZE + MAX_DIST-1)
       * => more >= window_size - 2*WSIZE + 2
       * In the BIG_MEM or MMAP case (not yet supported),
       *   window_size == input_size + MIN_LOOKAHEAD  &&
       *   strstart + s->lookahead <= input_size => more >= MIN_LOOKAHEAD.
       * Otherwise, window_size == 2*WSIZE so more >= 2.
       * If there was sliding, more >= WSIZE. So in all cases, more >= 2.
       */
      //Assert(more >= 2, "more < 2");


      n = read_buf(s.strm, s.window, s.strstart + s.lookahead, more);
      s.lookahead += n;
      /* Initialize the hash value now that we have some input: */

      if (s.lookahead + s.insert >= MIN_MATCH) {
        str = s.strstart - s.insert;
        s.ins_h = s.window[str];
        /* UPDATE_HASH(s, s->ins_h, s->window[str + 1]); */

        s.ins_h = HASH(s, s.ins_h, s.window[str + 1]); //#if MIN_MATCH != 3
        //        Call update_hash() MIN_MATCH-3 more times
        //#endif

        while (s.insert) {
          /* UPDATE_HASH(s, s->ins_h, s->window[str + MIN_MATCH-1]); */
          s.ins_h = HASH(s, s.ins_h, s.window[str + MIN_MATCH - 1]);
          s.prev[str & s.w_mask] = s.head[s.ins_h];
          s.head[s.ins_h] = str;
          str++;
          s.insert--;

          if (s.lookahead + s.insert < MIN_MATCH) {
            break;
          }
        }
      }
      /* If the whole input has less than MIN_MATCH bytes, ins_h is garbage,
       * but this is not important since only literal bytes will be emitted.
       */

    } while (s.lookahead < MIN_LOOKAHEAD && s.strm.avail_in !== 0);
    /* If the WIN_INIT bytes after the end of the current data have never been
     * written, then zero those bytes in order to avoid memory check reports of
     * the use of uninitialized (or uninitialised as Julian writes) bytes by
     * the longest match routines.  Update the high water mark for the next
     * time through here.  WIN_INIT is set to MAX_MATCH since the longest match
     * routines allow scanning to strstart + MAX_MATCH, ignoring lookahead.
     */
    //  if (s.high_water < s.window_size) {
    //    const curr = s.strstart + s.lookahead;
    //    let init = 0;
    //
    //    if (s.high_water < curr) {
    //      /* Previous high water mark below current data -- zero WIN_INIT
    //       * bytes or up to end of window, whichever is less.
    //       */
    //      init = s.window_size - curr;
    //      if (init > WIN_INIT)
    //        init = WIN_INIT;
    //      zmemzero(s->window + curr, (unsigned)init);
    //      s->high_water = curr + init;
    //    }
    //    else if (s->high_water < (ulg)curr + WIN_INIT) {
    //      /* High water mark at or above current data, but below current data
    //       * plus WIN_INIT -- zero out to current data plus WIN_INIT, or up
    //       * to end of window, whichever is less.
    //       */
    //      init = (ulg)curr + WIN_INIT - s->high_water;
    //      if (init > s->window_size - s->high_water)
    //        init = s->window_size - s->high_water;
    //      zmemzero(s->window + s->high_water, (unsigned)init);
    //      s->high_water += init;
    //    }
    //  }
    //
    //  Assert((ulg)s->strstart <= s->window_size - MIN_LOOKAHEAD,
    //    "not enough room for search");

  };
  /* ===========================================================================
   * Copy without compression as much as possible from the input stream, return
   * the current block state.
   * This function does not insert new strings in the dictionary since
   * uncompressible data is probably not useful. This function is used
   * only for the level=0 compression option.
   * NOTE: this function should be optimized to avoid extra copying from
   * window to pending_buf.
   */


  var deflate_stored = function deflate_stored(s, flush) {
    /* Stored blocks are limited to 0xffff bytes, pending_buf is limited
     * to pending_buf_size, and each stored block has a 5 byte header:
     */
    var max_block_size = 0xffff;

    if (max_block_size > s.pending_buf_size - 5) {
      max_block_size = s.pending_buf_size - 5;
    }
    /* Copy as much as possible from input to output: */


    for (;;) {
      /* Fill the window as much as possible: */
      if (s.lookahead <= 1) {
        //Assert(s->strstart < s->w_size+MAX_DIST(s) ||
        //  s->block_start >= (long)s->w_size, "slide too late");
        //      if (!(s.strstart < s.w_size + (s.w_size - MIN_LOOKAHEAD) ||
        //        s.block_start >= s.w_size)) {
        //        throw  new Error("slide too late");
        //      }
        fill_window(s);

        if (s.lookahead === 0 && flush === Z_NO_FLUSH$2) {
          return BS_NEED_MORE;
        }

        if (s.lookahead === 0) {
          break;
        }
        /* flush the current block */

      } //Assert(s->block_start >= 0L, "block gone");
      //    if (s.block_start < 0) throw new Error("block gone");


      s.strstart += s.lookahead;
      s.lookahead = 0;
      /* Emit a stored block if pending_buf will be full: */

      var max_start = s.block_start + max_block_size;

      if (s.strstart === 0 || s.strstart >= max_start) {
        /* strstart == 0 is possible when wraparound on 16-bit machine */
        s.lookahead = s.strstart - max_start;
        s.strstart = max_start;
        /*** FLUSH_BLOCK(s, 0); ***/

        flush_block_only(s, false);

        if (s.strm.avail_out === 0) {
          return BS_NEED_MORE;
        }
        /***/

      }
      /* Flush if we may have to slide, otherwise block_start may become
       * negative and the data will be gone:
       */


      if (s.strstart - s.block_start >= s.w_size - MIN_LOOKAHEAD) {
        /*** FLUSH_BLOCK(s, 0); ***/
        flush_block_only(s, false);

        if (s.strm.avail_out === 0) {
          return BS_NEED_MORE;
        }
        /***/

      }
    }

    s.insert = 0;

    if (flush === Z_FINISH$3) {
      /*** FLUSH_BLOCK(s, 1); ***/
      flush_block_only(s, true);

      if (s.strm.avail_out === 0) {
        return BS_FINISH_STARTED;
      }
      /***/


      return BS_FINISH_DONE;
    }

    if (s.strstart > s.block_start) {
      /*** FLUSH_BLOCK(s, 0); ***/
      flush_block_only(s, false);

      if (s.strm.avail_out === 0) {
        return BS_NEED_MORE;
      }
      /***/

    }

    return BS_NEED_MORE;
  };
  /* ===========================================================================
   * Compress as much as possible from the input stream, return the current
   * block state.
   * This function does not perform lazy evaluation of matches and inserts
   * new strings in the dictionary only for unmatched strings or for short
   * matches. It is used only for the fast compression options.
   */


  var deflate_fast = function deflate_fast(s, flush) {
    var hash_head;
    /* head of the hash chain */

    var bflush;
    /* set if current block must be flushed */

    for (;;) {
      /* Make sure that we always have enough lookahead, except
       * at the end of the input file. We need MAX_MATCH bytes
       * for the next match, plus MIN_MATCH bytes to insert the
       * string following the next match.
       */
      if (s.lookahead < MIN_LOOKAHEAD) {
        fill_window(s);

        if (s.lookahead < MIN_LOOKAHEAD && flush === Z_NO_FLUSH$2) {
          return BS_NEED_MORE;
        }

        if (s.lookahead === 0) {
          break;
          /* flush the current block */
        }
      }
      /* Insert the string window[strstart .. strstart+2] in the
       * dictionary, and set hash_head to the head of the hash chain:
       */


      hash_head = 0
      /*NIL*/
      ;

      if (s.lookahead >= MIN_MATCH) {
        /*** INSERT_STRING(s, s.strstart, hash_head); ***/
        s.ins_h = HASH(s, s.ins_h, s.window[s.strstart + MIN_MATCH - 1]);
        hash_head = s.prev[s.strstart & s.w_mask] = s.head[s.ins_h];
        s.head[s.ins_h] = s.strstart;
        /***/
      }
      /* Find the longest match, discarding those <= prev_length.
       * At this point we have always match_length < MIN_MATCH
       */


      if (hash_head !== 0
      /*NIL*/
      && s.strstart - hash_head <= s.w_size - MIN_LOOKAHEAD) {
        /* To simplify the code, we prevent matches with the string
         * of window index 0 (in particular we have to avoid a match
         * of the string with itself at the start of the input file).
         */
        s.match_length = longest_match(s, hash_head);
        /* longest_match() sets match_start */
      }

      if (s.match_length >= MIN_MATCH) {
        // check_match(s, s.strstart, s.match_start, s.match_length); // for debug only

        /*** _tr_tally_dist(s, s.strstart - s.match_start,
                       s.match_length - MIN_MATCH, bflush); ***/
        bflush = _tr_tally(s, s.strstart - s.match_start, s.match_length - MIN_MATCH);
        s.lookahead -= s.match_length;
        /* Insert new strings in the hash table only if the match length
         * is not too large. This saves time but degrades compression.
         */

        if (s.match_length <= s.max_lazy_match
        /*max_insert_length*/
        && s.lookahead >= MIN_MATCH) {
          s.match_length--;
          /* string at strstart already in table */

          do {
            s.strstart++;
            /*** INSERT_STRING(s, s.strstart, hash_head); ***/

            s.ins_h = HASH(s, s.ins_h, s.window[s.strstart + MIN_MATCH - 1]);
            hash_head = s.prev[s.strstart & s.w_mask] = s.head[s.ins_h];
            s.head[s.ins_h] = s.strstart;
            /***/

            /* strstart never exceeds WSIZE-MAX_MATCH, so there are
             * always MIN_MATCH bytes ahead.
             */
          } while (--s.match_length !== 0);

          s.strstart++;
        } else {
          s.strstart += s.match_length;
          s.match_length = 0;
          s.ins_h = s.window[s.strstart];
          /* UPDATE_HASH(s, s.ins_h, s.window[s.strstart+1]); */

          s.ins_h = HASH(s, s.ins_h, s.window[s.strstart + 1]); //#if MIN_MATCH != 3
          //                Call UPDATE_HASH() MIN_MATCH-3 more times
          //#endif

          /* If lookahead < MIN_MATCH, ins_h is garbage, but it does not
           * matter since it will be recomputed at next deflate call.
           */
        }
      } else {
        /* No match, output a literal byte */
        //Tracevv((stderr,"%c", s.window[s.strstart]));

        /*** _tr_tally_lit(s, s.window[s.strstart], bflush); ***/
        bflush = _tr_tally(s, 0, s.window[s.strstart]);
        s.lookahead--;
        s.strstart++;
      }

      if (bflush) {
        /*** FLUSH_BLOCK(s, 0); ***/
        flush_block_only(s, false);

        if (s.strm.avail_out === 0) {
          return BS_NEED_MORE;
        }
        /***/

      }
    }

    s.insert = s.strstart < MIN_MATCH - 1 ? s.strstart : MIN_MATCH - 1;

    if (flush === Z_FINISH$3) {
      /*** FLUSH_BLOCK(s, 1); ***/
      flush_block_only(s, true);

      if (s.strm.avail_out === 0) {
        return BS_FINISH_STARTED;
      }
      /***/


      return BS_FINISH_DONE;
    }

    if (s.last_lit) {
      /*** FLUSH_BLOCK(s, 0); ***/
      flush_block_only(s, false);

      if (s.strm.avail_out === 0) {
        return BS_NEED_MORE;
      }
      /***/

    }

    return BS_BLOCK_DONE;
  };
  /* ===========================================================================
   * Same as above, but achieves better compression. We use a lazy
   * evaluation for matches: a match is finally adopted only if there is
   * no better match at the next window position.
   */


  var deflate_slow = function deflate_slow(s, flush) {
    var hash_head;
    /* head of hash chain */

    var bflush;
    /* set if current block must be flushed */

    var max_insert;
    /* Process the input block. */

    for (;;) {
      /* Make sure that we always have enough lookahead, except
       * at the end of the input file. We need MAX_MATCH bytes
       * for the next match, plus MIN_MATCH bytes to insert the
       * string following the next match.
       */
      if (s.lookahead < MIN_LOOKAHEAD) {
        fill_window(s);

        if (s.lookahead < MIN_LOOKAHEAD && flush === Z_NO_FLUSH$2) {
          return BS_NEED_MORE;
        }

        if (s.lookahead === 0) {
          break;
        }
        /* flush the current block */

      }
      /* Insert the string window[strstart .. strstart+2] in the
       * dictionary, and set hash_head to the head of the hash chain:
       */


      hash_head = 0
      /*NIL*/
      ;

      if (s.lookahead >= MIN_MATCH) {
        /*** INSERT_STRING(s, s.strstart, hash_head); ***/
        s.ins_h = HASH(s, s.ins_h, s.window[s.strstart + MIN_MATCH - 1]);
        hash_head = s.prev[s.strstart & s.w_mask] = s.head[s.ins_h];
        s.head[s.ins_h] = s.strstart;
        /***/
      }
      /* Find the longest match, discarding those <= prev_length.
       */


      s.prev_length = s.match_length;
      s.prev_match = s.match_start;
      s.match_length = MIN_MATCH - 1;

      if (hash_head !== 0
      /*NIL*/
      && s.prev_length < s.max_lazy_match && s.strstart - hash_head <= s.w_size - MIN_LOOKAHEAD
      /*MAX_DIST(s)*/
      ) {
        /* To simplify the code, we prevent matches with the string
         * of window index 0 (in particular we have to avoid a match
         * of the string with itself at the start of the input file).
         */
        s.match_length = longest_match(s, hash_head);
        /* longest_match() sets match_start */

        if (s.match_length <= 5 && (s.strategy === Z_FILTERED || s.match_length === MIN_MATCH && s.strstart - s.match_start > 4096
        /*TOO_FAR*/
        )) {
          /* If prev_match is also MIN_MATCH, match_start is garbage
           * but we will ignore the current match anyway.
           */
          s.match_length = MIN_MATCH - 1;
        }
      }
      /* If there was a match at the previous step and the current
       * match is not better, output the previous match:
       */


      if (s.prev_length >= MIN_MATCH && s.match_length <= s.prev_length) {
        max_insert = s.strstart + s.lookahead - MIN_MATCH;
        /* Do not insert strings in hash table beyond this. */
        //check_match(s, s.strstart-1, s.prev_match, s.prev_length);

        /***_tr_tally_dist(s, s.strstart - 1 - s.prev_match,
                       s.prev_length - MIN_MATCH, bflush);***/

        bflush = _tr_tally(s, s.strstart - 1 - s.prev_match, s.prev_length - MIN_MATCH);
        /* Insert in hash table all strings up to the end of the match.
         * strstart-1 and strstart are already inserted. If there is not
         * enough lookahead, the last two strings are not inserted in
         * the hash table.
         */

        s.lookahead -= s.prev_length - 1;
        s.prev_length -= 2;

        do {
          if (++s.strstart <= max_insert) {
            /*** INSERT_STRING(s, s.strstart, hash_head); ***/
            s.ins_h = HASH(s, s.ins_h, s.window[s.strstart + MIN_MATCH - 1]);
            hash_head = s.prev[s.strstart & s.w_mask] = s.head[s.ins_h];
            s.head[s.ins_h] = s.strstart;
            /***/
          }
        } while (--s.prev_length !== 0);

        s.match_available = 0;
        s.match_length = MIN_MATCH - 1;
        s.strstart++;

        if (bflush) {
          /*** FLUSH_BLOCK(s, 0); ***/
          flush_block_only(s, false);

          if (s.strm.avail_out === 0) {
            return BS_NEED_MORE;
          }
          /***/

        }
      } else if (s.match_available) {
        /* If there was no match at the previous position, output a
         * single literal. If there was a match but the current match
         * is longer, truncate the previous match to a single literal.
         */
        //Tracevv((stderr,"%c", s->window[s->strstart-1]));

        /*** _tr_tally_lit(s, s.window[s.strstart-1], bflush); ***/
        bflush = _tr_tally(s, 0, s.window[s.strstart - 1]);

        if (bflush) {
          /*** FLUSH_BLOCK_ONLY(s, 0) ***/
          flush_block_only(s, false);
          /***/
        }

        s.strstart++;
        s.lookahead--;

        if (s.strm.avail_out === 0) {
          return BS_NEED_MORE;
        }
      } else {
        /* There is no previous match to compare with, wait for
         * the next step to decide.
         */
        s.match_available = 1;
        s.strstart++;
        s.lookahead--;
      }
    } //Assert (flush != Z_NO_FLUSH, "no flush?");


    if (s.match_available) {
      //Tracevv((stderr,"%c", s->window[s->strstart-1]));

      /*** _tr_tally_lit(s, s.window[s.strstart-1], bflush); ***/
      bflush = _tr_tally(s, 0, s.window[s.strstart - 1]);
      s.match_available = 0;
    }

    s.insert = s.strstart < MIN_MATCH - 1 ? s.strstart : MIN_MATCH - 1;

    if (flush === Z_FINISH$3) {
      /*** FLUSH_BLOCK(s, 1); ***/
      flush_block_only(s, true);

      if (s.strm.avail_out === 0) {
        return BS_FINISH_STARTED;
      }
      /***/


      return BS_FINISH_DONE;
    }

    if (s.last_lit) {
      /*** FLUSH_BLOCK(s, 0); ***/
      flush_block_only(s, false);

      if (s.strm.avail_out === 0) {
        return BS_NEED_MORE;
      }
      /***/

    }

    return BS_BLOCK_DONE;
  };
  /* ===========================================================================
   * For Z_RLE, simply look for runs of bytes, generate matches only of distance
   * one.  Do not maintain a hash table.  (It will be regenerated if this run of
   * deflate switches away from Z_RLE.)
   */


  var deflate_rle = function deflate_rle(s, flush) {
    var bflush;
    /* set if current block must be flushed */

    var prev;
    /* byte at distance one to match */

    var scan, strend;
    /* scan goes up to strend for length of run */

    var _win = s.window;

    for (;;) {
      /* Make sure that we always have enough lookahead, except
       * at the end of the input file. We need MAX_MATCH bytes
       * for the longest run, plus one for the unrolled loop.
       */
      if (s.lookahead <= MAX_MATCH) {
        fill_window(s);

        if (s.lookahead <= MAX_MATCH && flush === Z_NO_FLUSH$2) {
          return BS_NEED_MORE;
        }

        if (s.lookahead === 0) {
          break;
        }
        /* flush the current block */

      }
      /* See how many times the previous byte repeats */


      s.match_length = 0;

      if (s.lookahead >= MIN_MATCH && s.strstart > 0) {
        scan = s.strstart - 1;
        prev = _win[scan];

        if (prev === _win[++scan] && prev === _win[++scan] && prev === _win[++scan]) {
          strend = s.strstart + MAX_MATCH;

          do {
            /*jshint noempty:false*/
          } while (prev === _win[++scan] && prev === _win[++scan] && prev === _win[++scan] && prev === _win[++scan] && prev === _win[++scan] && prev === _win[++scan] && prev === _win[++scan] && prev === _win[++scan] && scan < strend);

          s.match_length = MAX_MATCH - (strend - scan);

          if (s.match_length > s.lookahead) {
            s.match_length = s.lookahead;
          }
        } //Assert(scan <= s->window+(uInt)(s->window_size-1), "wild scan");

      }
      /* Emit match if have run of MIN_MATCH or longer, else emit literal */


      if (s.match_length >= MIN_MATCH) {
        //check_match(s, s.strstart, s.strstart - 1, s.match_length);

        /*** _tr_tally_dist(s, 1, s.match_length - MIN_MATCH, bflush); ***/
        bflush = _tr_tally(s, 1, s.match_length - MIN_MATCH);
        s.lookahead -= s.match_length;
        s.strstart += s.match_length;
        s.match_length = 0;
      } else {
        /* No match, output a literal byte */
        //Tracevv((stderr,"%c", s->window[s->strstart]));

        /*** _tr_tally_lit(s, s.window[s.strstart], bflush); ***/
        bflush = _tr_tally(s, 0, s.window[s.strstart]);
        s.lookahead--;
        s.strstart++;
      }

      if (bflush) {
        /*** FLUSH_BLOCK(s, 0); ***/
        flush_block_only(s, false);

        if (s.strm.avail_out === 0) {
          return BS_NEED_MORE;
        }
        /***/

      }
    }

    s.insert = 0;

    if (flush === Z_FINISH$3) {
      /*** FLUSH_BLOCK(s, 1); ***/
      flush_block_only(s, true);

      if (s.strm.avail_out === 0) {
        return BS_FINISH_STARTED;
      }
      /***/


      return BS_FINISH_DONE;
    }

    if (s.last_lit) {
      /*** FLUSH_BLOCK(s, 0); ***/
      flush_block_only(s, false);

      if (s.strm.avail_out === 0) {
        return BS_NEED_MORE;
      }
      /***/

    }

    return BS_BLOCK_DONE;
  };
  /* ===========================================================================
   * For Z_HUFFMAN_ONLY, do not look for matches.  Do not maintain a hash table.
   * (It will be regenerated if this run of deflate switches away from Huffman.)
   */


  var deflate_huff = function deflate_huff(s, flush) {
    var bflush;
    /* set if current block must be flushed */

    for (;;) {
      /* Make sure that we have a literal to write. */
      if (s.lookahead === 0) {
        fill_window(s);

        if (s.lookahead === 0) {
          if (flush === Z_NO_FLUSH$2) {
            return BS_NEED_MORE;
          }

          break;
          /* flush the current block */
        }
      }
      /* Output a literal byte */


      s.match_length = 0; //Tracevv((stderr,"%c", s->window[s->strstart]));

      /*** _tr_tally_lit(s, s.window[s.strstart], bflush); ***/

      bflush = _tr_tally(s, 0, s.window[s.strstart]);
      s.lookahead--;
      s.strstart++;

      if (bflush) {
        /*** FLUSH_BLOCK(s, 0); ***/
        flush_block_only(s, false);

        if (s.strm.avail_out === 0) {
          return BS_NEED_MORE;
        }
        /***/

      }
    }

    s.insert = 0;

    if (flush === Z_FINISH$3) {
      /*** FLUSH_BLOCK(s, 1); ***/
      flush_block_only(s, true);

      if (s.strm.avail_out === 0) {
        return BS_FINISH_STARTED;
      }
      /***/


      return BS_FINISH_DONE;
    }

    if (s.last_lit) {
      /*** FLUSH_BLOCK(s, 0); ***/
      flush_block_only(s, false);

      if (s.strm.avail_out === 0) {
        return BS_NEED_MORE;
      }
      /***/

    }

    return BS_BLOCK_DONE;
  };
  /* Values for max_lazy_match, good_match and max_chain_length, depending on
   * the desired pack level (0..9). The values given below have been tuned to
   * exclude worst case performance for pathological files. Better values may be
   * found for specific files.
   */


  function Config(good_length, max_lazy, nice_length, max_chain, func) {
    this.good_length = good_length;
    this.max_lazy = max_lazy;
    this.nice_length = nice_length;
    this.max_chain = max_chain;
    this.func = func;
  }

  var configuration_table = [
  /*      good lazy nice chain */
  new Config(0, 0, 0, 0, deflate_stored),
  /* 0 store only */
  new Config(4, 4, 8, 4, deflate_fast),
  /* 1 max speed, no lazy matches */
  new Config(4, 5, 16, 8, deflate_fast),
  /* 2 */
  new Config(4, 6, 32, 32, deflate_fast),
  /* 3 */
  new Config(4, 4, 16, 16, deflate_slow),
  /* 4 lazy matches */
  new Config(8, 16, 32, 32, deflate_slow),
  /* 5 */
  new Config(8, 16, 128, 128, deflate_slow),
  /* 6 */
  new Config(8, 32, 128, 256, deflate_slow),
  /* 7 */
  new Config(32, 128, 258, 1024, deflate_slow),
  /* 8 */
  new Config(32, 258, 258, 4096, deflate_slow)
  /* 9 max compression */
  ];
  /* ===========================================================================
   * Initialize the "longest match" routines for a new zlib stream
   */

  var lm_init = function lm_init(s) {
    s.window_size = 2 * s.w_size;
    /*** CLEAR_HASH(s); ***/

    zero(s.head); // Fill with NIL (= 0);

    /* Set the default configuration parameters:
     */

    s.max_lazy_match = configuration_table[s.level].max_lazy;
    s.good_match = configuration_table[s.level].good_length;
    s.nice_match = configuration_table[s.level].nice_length;
    s.max_chain_length = configuration_table[s.level].max_chain;
    s.strstart = 0;
    s.block_start = 0;
    s.lookahead = 0;
    s.insert = 0;
    s.match_length = s.prev_length = MIN_MATCH - 1;
    s.match_available = 0;
    s.ins_h = 0;
  };

  function DeflateState() {
    this.strm = null;
    /* pointer back to this zlib stream */

    this.status = 0;
    /* as the name implies */

    this.pending_buf = null;
    /* output still pending */

    this.pending_buf_size = 0;
    /* size of pending_buf */

    this.pending_out = 0;
    /* next pending byte to output to the stream */

    this.pending = 0;
    /* nb of bytes in the pending buffer */

    this.wrap = 0;
    /* bit 0 true for zlib, bit 1 true for gzip */

    this.gzhead = null;
    /* gzip header information to write */

    this.gzindex = 0;
    /* where in extra, name, or comment */

    this.method = Z_DEFLATED$2;
    /* can only be DEFLATED */

    this.last_flush = -1;
    /* value of flush param for previous deflate call */

    this.w_size = 0;
    /* LZ77 window size (32K by default) */

    this.w_bits = 0;
    /* log2(w_size)  (8..16) */

    this.w_mask = 0;
    /* w_size - 1 */

    this.window = null;
    /* Sliding window. Input bytes are read into the second half of the window,
     * and move to the first half later to keep a dictionary of at least wSize
     * bytes. With this organization, matches are limited to a distance of
     * wSize-MAX_MATCH bytes, but this ensures that IO is always
     * performed with a length multiple of the block size.
     */

    this.window_size = 0;
    /* Actual size of window: 2*wSize, except when the user input buffer
     * is directly used as sliding window.
     */

    this.prev = null;
    /* Link to older string with same hash index. To limit the size of this
     * array to 64K, this link is maintained only for the last 32K strings.
     * An index in this array is thus a window index modulo 32K.
     */

    this.head = null;
    /* Heads of the hash chains or NIL. */

    this.ins_h = 0;
    /* hash index of string to be inserted */

    this.hash_size = 0;
    /* number of elements in hash table */

    this.hash_bits = 0;
    /* log2(hash_size) */

    this.hash_mask = 0;
    /* hash_size-1 */

    this.hash_shift = 0;
    /* Number of bits by which ins_h must be shifted at each input
     * step. It must be such that after MIN_MATCH steps, the oldest
     * byte no longer takes part in the hash key, that is:
     *   hash_shift * MIN_MATCH >= hash_bits
     */

    this.block_start = 0;
    /* Window position at the beginning of the current output block. Gets
     * negative when the window is moved backwards.
     */

    this.match_length = 0;
    /* length of best match */

    this.prev_match = 0;
    /* previous match */

    this.match_available = 0;
    /* set if previous match exists */

    this.strstart = 0;
    /* start of string to insert */

    this.match_start = 0;
    /* start of matching string */

    this.lookahead = 0;
    /* number of valid bytes ahead in window */

    this.prev_length = 0;
    /* Length of the best match at previous step. Matches not greater than this
     * are discarded. This is used in the lazy match evaluation.
     */

    this.max_chain_length = 0;
    /* To speed up deflation, hash chains are never searched beyond this
     * length.  A higher limit improves compression ratio but degrades the
     * speed.
     */

    this.max_lazy_match = 0;
    /* Attempt to find a better match only when the current match is strictly
     * smaller than this value. This mechanism is used only for compression
     * levels >= 4.
     */
    // That's alias to max_lazy_match, don't use directly
    //this.max_insert_length = 0;

    /* Insert new strings in the hash table only if the match length is not
     * greater than this length. This saves time but degrades compression.
     * max_insert_length is used only for compression levels <= 3.
     */

    this.level = 0;
    /* compression level (1..9) */

    this.strategy = 0;
    /* favor or force Huffman coding*/

    this.good_match = 0;
    /* Use a faster search when the previous match is longer than this */

    this.nice_match = 0;
    /* Stop searching when current match exceeds this */

    /* used by trees.c: */

    /* Didn't use ct_data typedef below to suppress compiler warning */
    // struct ct_data_s dyn_ltree[HEAP_SIZE];   /* literal and length tree */
    // struct ct_data_s dyn_dtree[2*D_CODES+1]; /* distance tree */
    // struct ct_data_s bl_tree[2*BL_CODES+1];  /* Huffman tree for bit lengths */
    // Use flat array of DOUBLE size, with interleaved fata,
    // because JS does not support effective

    this.dyn_ltree = new Uint16Array(HEAP_SIZE * 2);
    this.dyn_dtree = new Uint16Array((2 * D_CODES + 1) * 2);
    this.bl_tree = new Uint16Array((2 * BL_CODES + 1) * 2);
    zero(this.dyn_ltree);
    zero(this.dyn_dtree);
    zero(this.bl_tree);
    this.l_desc = null;
    /* desc. for literal tree */

    this.d_desc = null;
    /* desc. for distance tree */

    this.bl_desc = null;
    /* desc. for bit length tree */
    //ush bl_count[MAX_BITS+1];

    this.bl_count = new Uint16Array(MAX_BITS + 1);
    /* number of codes at each bit length for an optimal tree */
    //int heap[2*L_CODES+1];      /* heap used to build the Huffman trees */

    this.heap = new Uint16Array(2 * L_CODES + 1);
    /* heap used to build the Huffman trees */

    zero(this.heap);
    this.heap_len = 0;
    /* number of elements in the heap */

    this.heap_max = 0;
    /* element of largest frequency */

    /* The sons of heap[n] are heap[2*n] and heap[2*n+1]. heap[0] is not used.
     * The same heap array is used to build all trees.
     */

    this.depth = new Uint16Array(2 * L_CODES + 1); //uch depth[2*L_CODES+1];

    zero(this.depth);
    /* Depth of each subtree used as tie breaker for trees of equal frequency
     */

    this.l_buf = 0;
    /* buffer index for literals or lengths */

    this.lit_bufsize = 0;
    /* Size of match buffer for literals/lengths.  There are 4 reasons for
     * limiting lit_bufsize to 64K:
     *   - frequencies can be kept in 16 bit counters
     *   - if compression is not successful for the first block, all input
     *     data is still in the window so we can still emit a stored block even
     *     when input comes from standard input.  (This can also be done for
     *     all blocks if lit_bufsize is not greater than 32K.)
     *   - if compression is not successful for a file smaller than 64K, we can
     *     even emit a stored file instead of a stored block (saving 5 bytes).
     *     This is applicable only for zip (not gzip or zlib).
     *   - creating new Huffman trees less frequently may not provide fast
     *     adaptation to changes in the input data statistics. (Take for
     *     example a binary file with poorly compressible code followed by
     *     a highly compressible string table.) Smaller buffer sizes give
     *     fast adaptation but have of course the overhead of transmitting
     *     trees more frequently.
     *   - I can't count above 4
     */

    this.last_lit = 0;
    /* running index in l_buf */

    this.d_buf = 0;
    /* Buffer index for distances. To simplify the code, d_buf and l_buf have
     * the same number of elements. To use different lengths, an extra flag
     * array would be necessary.
     */

    this.opt_len = 0;
    /* bit length of current block with optimal trees */

    this.static_len = 0;
    /* bit length of current block with static trees */

    this.matches = 0;
    /* number of string matches in current block */

    this.insert = 0;
    /* bytes at end of window left to insert */

    this.bi_buf = 0;
    /* Output buffer. bits are inserted starting at the bottom (least
     * significant bits).
     */

    this.bi_valid = 0;
    /* Number of valid bits in bi_buf.  All bits above the last valid bit
     * are always zero.
     */
    // Used for window memory init. We safely ignore it for JS. That makes
    // sense only for pointers and memory check tools.
    //this.high_water = 0;

    /* High water mark offset in window for initialized bytes -- bytes above
     * this are set to zero in order to avoid memory check warnings when
     * longest match routines access bytes past the input.  This is then
     * updated to the new high water mark.
     */
  }

  var deflateResetKeep = function deflateResetKeep(strm) {
    if (!strm || !strm.state) {
      return err(strm, Z_STREAM_ERROR$2);
    }

    strm.total_in = strm.total_out = 0;
    strm.data_type = Z_UNKNOWN;
    var s = strm.state;
    s.pending = 0;
    s.pending_out = 0;

    if (s.wrap < 0) {
      s.wrap = -s.wrap;
      /* was made negative by deflate(..., Z_FINISH); */
    }

    s.status = s.wrap ? INIT_STATE : BUSY_STATE;
    strm.adler = s.wrap === 2 ? 0 // crc32(0, Z_NULL, 0)
    : 1; // adler32(0, Z_NULL, 0)

    s.last_flush = Z_NO_FLUSH$2;

    _tr_init(s);

    return Z_OK$3;
  };

  var deflateReset = function deflateReset(strm) {
    var ret = deflateResetKeep(strm);

    if (ret === Z_OK$3) {
      lm_init(strm.state);
    }

    return ret;
  };

  var deflateSetHeader = function deflateSetHeader(strm, head) {
    if (!strm || !strm.state) {
      return Z_STREAM_ERROR$2;
    }

    if (strm.state.wrap !== 2) {
      return Z_STREAM_ERROR$2;
    }

    strm.state.gzhead = head;
    return Z_OK$3;
  };

  var deflateInit2 = function deflateInit2(strm, level, method, windowBits, memLevel, strategy) {
    if (!strm) {
      // === Z_NULL
      return Z_STREAM_ERROR$2;
    }

    var wrap = 1;

    if (level === Z_DEFAULT_COMPRESSION$1) {
      level = 6;
    }

    if (windowBits < 0) {
      /* suppress zlib wrapper */
      wrap = 0;
      windowBits = -windowBits;
    } else if (windowBits > 15) {
      wrap = 2;
      /* write gzip wrapper instead */

      windowBits -= 16;
    }

    if (memLevel < 1 || memLevel > MAX_MEM_LEVEL || method !== Z_DEFLATED$2 || windowBits < 8 || windowBits > 15 || level < 0 || level > 9 || strategy < 0 || strategy > Z_FIXED) {
      return err(strm, Z_STREAM_ERROR$2);
    }

    if (windowBits === 8) {
      windowBits = 9;
    }
    /* until 256-byte window bug fixed */


    var s = new DeflateState();
    strm.state = s;
    s.strm = strm;
    s.wrap = wrap;
    s.gzhead = null;
    s.w_bits = windowBits;
    s.w_size = 1 << s.w_bits;
    s.w_mask = s.w_size - 1;
    s.hash_bits = memLevel + 7;
    s.hash_size = 1 << s.hash_bits;
    s.hash_mask = s.hash_size - 1;
    s.hash_shift = ~~((s.hash_bits + MIN_MATCH - 1) / MIN_MATCH);
    s.window = new Uint8Array(s.w_size * 2);
    s.head = new Uint16Array(s.hash_size);
    s.prev = new Uint16Array(s.w_size); // Don't need mem init magic for JS.
    //s.high_water = 0;  /* nothing written to s->window yet */

    s.lit_bufsize = 1 << memLevel + 6;
    /* 16K elements by default */

    s.pending_buf_size = s.lit_bufsize * 4; //overlay = (ushf *) ZALLOC(strm, s->lit_bufsize, sizeof(ush)+2);
    //s->pending_buf = (uchf *) overlay;

    s.pending_buf = new Uint8Array(s.pending_buf_size); // It is offset from `s.pending_buf` (size is `s.lit_bufsize * 2`)
    //s->d_buf = overlay + s->lit_bufsize/sizeof(ush);

    s.d_buf = 1 * s.lit_bufsize; //s->l_buf = s->pending_buf + (1+sizeof(ush))*s->lit_bufsize;

    s.l_buf = (1 + 2) * s.lit_bufsize;
    s.level = level;
    s.strategy = strategy;
    s.method = method;
    return deflateReset(strm);
  };

  var deflateInit = function deflateInit(strm, level) {
    return deflateInit2(strm, level, Z_DEFLATED$2, MAX_WBITS$1, DEF_MEM_LEVEL, Z_DEFAULT_STRATEGY$1);
  };

  var deflate$2 = function deflate(strm, flush) {
    var beg, val; // for gzip header write only

    if (!strm || !strm.state || flush > Z_BLOCK$1 || flush < 0) {
      return strm ? err(strm, Z_STREAM_ERROR$2) : Z_STREAM_ERROR$2;
    }

    var s = strm.state;

    if (!strm.output || !strm.input && strm.avail_in !== 0 || s.status === FINISH_STATE && flush !== Z_FINISH$3) {
      return err(strm, strm.avail_out === 0 ? Z_BUF_ERROR$1 : Z_STREAM_ERROR$2);
    }

    s.strm = strm;
    /* just in case */

    var old_flush = s.last_flush;
    s.last_flush = flush;
    /* Write the header */

    if (s.status === INIT_STATE) {
      if (s.wrap === 2) {
        // GZIP header
        strm.adler = 0; //crc32(0L, Z_NULL, 0);

        put_byte(s, 31);
        put_byte(s, 139);
        put_byte(s, 8);

        if (!s.gzhead) {
          // s->gzhead == Z_NULL
          put_byte(s, 0);
          put_byte(s, 0);
          put_byte(s, 0);
          put_byte(s, 0);
          put_byte(s, 0);
          put_byte(s, s.level === 9 ? 2 : s.strategy >= Z_HUFFMAN_ONLY || s.level < 2 ? 4 : 0);
          put_byte(s, OS_CODE);
          s.status = BUSY_STATE;
        } else {
          put_byte(s, (s.gzhead.text ? 1 : 0) + (s.gzhead.hcrc ? 2 : 0) + (!s.gzhead.extra ? 0 : 4) + (!s.gzhead.name ? 0 : 8) + (!s.gzhead.comment ? 0 : 16));
          put_byte(s, s.gzhead.time & 0xff);
          put_byte(s, s.gzhead.time >> 8 & 0xff);
          put_byte(s, s.gzhead.time >> 16 & 0xff);
          put_byte(s, s.gzhead.time >> 24 & 0xff);
          put_byte(s, s.level === 9 ? 2 : s.strategy >= Z_HUFFMAN_ONLY || s.level < 2 ? 4 : 0);
          put_byte(s, s.gzhead.os & 0xff);

          if (s.gzhead.extra && s.gzhead.extra.length) {
            put_byte(s, s.gzhead.extra.length & 0xff);
            put_byte(s, s.gzhead.extra.length >> 8 & 0xff);
          }

          if (s.gzhead.hcrc) {
            strm.adler = crc32_1(strm.adler, s.pending_buf, s.pending, 0);
          }

          s.gzindex = 0;
          s.status = EXTRA_STATE;
        }
      } else // DEFLATE header
        {
          var header = Z_DEFLATED$2 + (s.w_bits - 8 << 4) << 8;
          var level_flags = -1;

          if (s.strategy >= Z_HUFFMAN_ONLY || s.level < 2) {
            level_flags = 0;
          } else if (s.level < 6) {
            level_flags = 1;
          } else if (s.level === 6) {
            level_flags = 2;
          } else {
            level_flags = 3;
          }

          header |= level_flags << 6;

          if (s.strstart !== 0) {
            header |= PRESET_DICT;
          }

          header += 31 - header % 31;
          s.status = BUSY_STATE;
          putShortMSB(s, header);
          /* Save the adler32 of the preset dictionary: */

          if (s.strstart !== 0) {
            putShortMSB(s, strm.adler >>> 16);
            putShortMSB(s, strm.adler & 0xffff);
          }

          strm.adler = 1; // adler32(0L, Z_NULL, 0);
        }
    } //#ifdef GZIP


    if (s.status === EXTRA_STATE) {
      if (s.gzhead.extra
      /* != Z_NULL*/
      ) {
        beg = s.pending;
        /* start of bytes to update crc */

        while (s.gzindex < (s.gzhead.extra.length & 0xffff)) {
          if (s.pending === s.pending_buf_size) {
            if (s.gzhead.hcrc && s.pending > beg) {
              strm.adler = crc32_1(strm.adler, s.pending_buf, s.pending - beg, beg);
            }

            flush_pending(strm);
            beg = s.pending;

            if (s.pending === s.pending_buf_size) {
              break;
            }
          }

          put_byte(s, s.gzhead.extra[s.gzindex] & 0xff);
          s.gzindex++;
        }

        if (s.gzhead.hcrc && s.pending > beg) {
          strm.adler = crc32_1(strm.adler, s.pending_buf, s.pending - beg, beg);
        }

        if (s.gzindex === s.gzhead.extra.length) {
          s.gzindex = 0;
          s.status = NAME_STATE;
        }
      } else {
        s.status = NAME_STATE;
      }
    }

    if (s.status === NAME_STATE) {
      if (s.gzhead.name
      /* != Z_NULL*/
      ) {
        beg = s.pending;
        /* start of bytes to update crc */
        //int val;

        do {
          if (s.pending === s.pending_buf_size) {
            if (s.gzhead.hcrc && s.pending > beg) {
              strm.adler = crc32_1(strm.adler, s.pending_buf, s.pending - beg, beg);
            }

            flush_pending(strm);
            beg = s.pending;

            if (s.pending === s.pending_buf_size) {
              val = 1;
              break;
            }
          } // JS specific: little magic to add zero terminator to end of string


          if (s.gzindex < s.gzhead.name.length) {
            val = s.gzhead.name.charCodeAt(s.gzindex++) & 0xff;
          } else {
            val = 0;
          }

          put_byte(s, val);
        } while (val !== 0);

        if (s.gzhead.hcrc && s.pending > beg) {
          strm.adler = crc32_1(strm.adler, s.pending_buf, s.pending - beg, beg);
        }

        if (val === 0) {
          s.gzindex = 0;
          s.status = COMMENT_STATE;
        }
      } else {
        s.status = COMMENT_STATE;
      }
    }

    if (s.status === COMMENT_STATE) {
      if (s.gzhead.comment
      /* != Z_NULL*/
      ) {
        beg = s.pending;
        /* start of bytes to update crc */
        //int val;

        do {
          if (s.pending === s.pending_buf_size) {
            if (s.gzhead.hcrc && s.pending > beg) {
              strm.adler = crc32_1(strm.adler, s.pending_buf, s.pending - beg, beg);
            }

            flush_pending(strm);
            beg = s.pending;

            if (s.pending === s.pending_buf_size) {
              val = 1;
              break;
            }
          } // JS specific: little magic to add zero terminator to end of string


          if (s.gzindex < s.gzhead.comment.length) {
            val = s.gzhead.comment.charCodeAt(s.gzindex++) & 0xff;
          } else {
            val = 0;
          }

          put_byte(s, val);
        } while (val !== 0);

        if (s.gzhead.hcrc && s.pending > beg) {
          strm.adler = crc32_1(strm.adler, s.pending_buf, s.pending - beg, beg);
        }

        if (val === 0) {
          s.status = HCRC_STATE;
        }
      } else {
        s.status = HCRC_STATE;
      }
    }

    if (s.status === HCRC_STATE) {
      if (s.gzhead.hcrc) {
        if (s.pending + 2 > s.pending_buf_size) {
          flush_pending(strm);
        }

        if (s.pending + 2 <= s.pending_buf_size) {
          put_byte(s, strm.adler & 0xff);
          put_byte(s, strm.adler >> 8 & 0xff);
          strm.adler = 0; //crc32(0L, Z_NULL, 0);

          s.status = BUSY_STATE;
        }
      } else {
        s.status = BUSY_STATE;
      }
    } //#endif

    /* Flush as much pending output as possible */


    if (s.pending !== 0) {
      flush_pending(strm);

      if (strm.avail_out === 0) {
        /* Since avail_out is 0, deflate will be called again with
         * more output space, but possibly with both pending and
         * avail_in equal to zero. There won't be anything to do,
         * but this is not an error situation so make sure we
         * return OK instead of BUF_ERROR at next call of deflate:
         */
        s.last_flush = -1;
        return Z_OK$3;
      }
      /* Make sure there is something to do and avoid duplicate consecutive
       * flushes. For repeated and useless calls with Z_FINISH, we keep
       * returning Z_STREAM_END instead of Z_BUF_ERROR.
       */

    } else if (strm.avail_in === 0 && rank(flush) <= rank(old_flush) && flush !== Z_FINISH$3) {
      return err(strm, Z_BUF_ERROR$1);
    }
    /* User must not provide more input after the first FINISH: */


    if (s.status === FINISH_STATE && strm.avail_in !== 0) {
      return err(strm, Z_BUF_ERROR$1);
    }
    /* Start a new block or continue the current one.
     */


    if (strm.avail_in !== 0 || s.lookahead !== 0 || flush !== Z_NO_FLUSH$2 && s.status !== FINISH_STATE) {
      var bstate = s.strategy === Z_HUFFMAN_ONLY ? deflate_huff(s, flush) : s.strategy === Z_RLE ? deflate_rle(s, flush) : configuration_table[s.level].func(s, flush);

      if (bstate === BS_FINISH_STARTED || bstate === BS_FINISH_DONE) {
        s.status = FINISH_STATE;
      }

      if (bstate === BS_NEED_MORE || bstate === BS_FINISH_STARTED) {
        if (strm.avail_out === 0) {
          s.last_flush = -1;
          /* avoid BUF_ERROR next call, see above */
        }

        return Z_OK$3;
        /* If flush != Z_NO_FLUSH && avail_out == 0, the next call
         * of deflate should use the same flush parameter to make sure
         * that the flush is complete. So we don't have to output an
         * empty block here, this will be done at next call. This also
         * ensures that for a very small output buffer, we emit at most
         * one empty block.
         */
      }

      if (bstate === BS_BLOCK_DONE) {
        if (flush === Z_PARTIAL_FLUSH) {
          _tr_align(s);
        } else if (flush !== Z_BLOCK$1) {
          /* FULL_FLUSH or SYNC_FLUSH */
          _tr_stored_block(s, 0, 0, false);
          /* For a full flush, this empty block will be recognized
           * as a special marker by inflate_sync().
           */


          if (flush === Z_FULL_FLUSH$1) {
            /*** CLEAR_HASH(s); ***/

            /* forget history */
            zero(s.head); // Fill with NIL (= 0);

            if (s.lookahead === 0) {
              s.strstart = 0;
              s.block_start = 0;
              s.insert = 0;
            }
          }
        }

        flush_pending(strm);

        if (strm.avail_out === 0) {
          s.last_flush = -1;
          /* avoid BUF_ERROR at next call, see above */

          return Z_OK$3;
        }
      }
    } //Assert(strm->avail_out > 0, "bug2");
    //if (strm.avail_out <= 0) { throw new Error("bug2");}


    if (flush !== Z_FINISH$3) {
      return Z_OK$3;
    }

    if (s.wrap <= 0) {
      return Z_STREAM_END$3;
    }
    /* Write the trailer */


    if (s.wrap === 2) {
      put_byte(s, strm.adler & 0xff);
      put_byte(s, strm.adler >> 8 & 0xff);
      put_byte(s, strm.adler >> 16 & 0xff);
      put_byte(s, strm.adler >> 24 & 0xff);
      put_byte(s, strm.total_in & 0xff);
      put_byte(s, strm.total_in >> 8 & 0xff);
      put_byte(s, strm.total_in >> 16 & 0xff);
      put_byte(s, strm.total_in >> 24 & 0xff);
    } else {
      putShortMSB(s, strm.adler >>> 16);
      putShortMSB(s, strm.adler & 0xffff);
    }

    flush_pending(strm);
    /* If avail_out is zero, the application will call deflate again
     * to flush the rest.
     */

    if (s.wrap > 0) {
      s.wrap = -s.wrap;
    }
    /* write the trailer only once! */


    return s.pending !== 0 ? Z_OK$3 : Z_STREAM_END$3;
  };

  var deflateEnd = function deflateEnd(strm) {
    if (!strm
    /*== Z_NULL*/
    || !strm.state
    /*== Z_NULL*/
    ) {
      return Z_STREAM_ERROR$2;
    }

    var status = strm.state.status;

    if (status !== INIT_STATE && status !== EXTRA_STATE && status !== NAME_STATE && status !== COMMENT_STATE && status !== HCRC_STATE && status !== BUSY_STATE && status !== FINISH_STATE) {
      return err(strm, Z_STREAM_ERROR$2);
    }

    strm.state = null;
    return status === BUSY_STATE ? err(strm, Z_DATA_ERROR$2) : Z_OK$3;
  };
  /* =========================================================================
   * Initializes the compression dictionary from the given byte
   * sequence without producing any compressed output.
   */


  var deflateSetDictionary = function deflateSetDictionary(strm, dictionary) {
    var dictLength = dictionary.length;

    if (!strm
    /*== Z_NULL*/
    || !strm.state
    /*== Z_NULL*/
    ) {
      return Z_STREAM_ERROR$2;
    }

    var s = strm.state;
    var wrap = s.wrap;

    if (wrap === 2 || wrap === 1 && s.status !== INIT_STATE || s.lookahead) {
      return Z_STREAM_ERROR$2;
    }
    /* when using zlib wrappers, compute Adler-32 for provided dictionary */


    if (wrap === 1) {
      /* adler32(strm->adler, dictionary, dictLength); */
      strm.adler = adler32_1(strm.adler, dictionary, dictLength, 0);
    }

    s.wrap = 0;
    /* avoid computing Adler-32 in read_buf */

    /* if dictionary would fill window, just replace the history */

    if (dictLength >= s.w_size) {
      if (wrap === 0) {
        /* already empty otherwise */

        /*** CLEAR_HASH(s); ***/
        zero(s.head); // Fill with NIL (= 0);

        s.strstart = 0;
        s.block_start = 0;
        s.insert = 0;
      }
      /* use the tail */
      // dictionary = dictionary.slice(dictLength - s.w_size);


      var tmpDict = new Uint8Array(s.w_size);
      tmpDict.set(dictionary.subarray(dictLength - s.w_size, dictLength), 0);
      dictionary = tmpDict;
      dictLength = s.w_size;
    }
    /* insert dictionary into window and hash */


    var avail = strm.avail_in;
    var next = strm.next_in;
    var input = strm.input;
    strm.avail_in = dictLength;
    strm.next_in = 0;
    strm.input = dictionary;
    fill_window(s);

    while (s.lookahead >= MIN_MATCH) {
      var str = s.strstart;
      var n = s.lookahead - (MIN_MATCH - 1);

      do {
        /* UPDATE_HASH(s, s->ins_h, s->window[str + MIN_MATCH-1]); */
        s.ins_h = HASH(s, s.ins_h, s.window[str + MIN_MATCH - 1]);
        s.prev[str & s.w_mask] = s.head[s.ins_h];
        s.head[s.ins_h] = str;
        str++;
      } while (--n);

      s.strstart = str;
      s.lookahead = MIN_MATCH - 1;
      fill_window(s);
    }

    s.strstart += s.lookahead;
    s.block_start = s.strstart;
    s.insert = s.lookahead;
    s.lookahead = 0;
    s.match_length = s.prev_length = MIN_MATCH - 1;
    s.match_available = 0;
    strm.next_in = next;
    strm.input = input;
    strm.avail_in = avail;
    s.wrap = wrap;
    return Z_OK$3;
  };

  var deflateInit_1 = deflateInit;
  var deflateInit2_1 = deflateInit2;
  var deflateReset_1 = deflateReset;
  var deflateResetKeep_1 = deflateResetKeep;
  var deflateSetHeader_1 = deflateSetHeader;
  var deflate_2$1 = deflate$2;
  var deflateEnd_1 = deflateEnd;
  var deflateSetDictionary_1 = deflateSetDictionary;
  var deflateInfo = 'pako deflate (from Nodeca project)';
  /* Not implemented
  module.exports.deflateBound = deflateBound;
  module.exports.deflateCopy = deflateCopy;
  module.exports.deflateParams = deflateParams;
  module.exports.deflatePending = deflatePending;
  module.exports.deflatePrime = deflatePrime;
  module.exports.deflateTune = deflateTune;
  */

  var deflate_1$2 = {
    deflateInit: deflateInit_1,
    deflateInit2: deflateInit2_1,
    deflateReset: deflateReset_1,
    deflateResetKeep: deflateResetKeep_1,
    deflateSetHeader: deflateSetHeader_1,
    deflate: deflate_2$1,
    deflateEnd: deflateEnd_1,
    deflateSetDictionary: deflateSetDictionary_1,
    deflateInfo: deflateInfo
  };

  function _typeof(obj) {
    "@babel/helpers - typeof";

    if (typeof Symbol === "function" && typeof Symbol.iterator === "symbol") {
      _typeof = function (obj) {
        return typeof obj;
      };
    } else {
      _typeof = function (obj) {
        return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj;
      };
    }

    return _typeof(obj);
  }

  var _has = function _has(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
  };

  var assign = function assign(obj
  /*from1, from2, from3, ...*/
  ) {
    var sources = Array.prototype.slice.call(arguments, 1);

    while (sources.length) {
      var source = sources.shift();

      if (!source) {
        continue;
      }

      if (_typeof(source) !== 'object') {
        throw new TypeError(source + 'must be non-object');
      }

      for (var p in source) {
        if (_has(source, p)) {
          obj[p] = source[p];
        }
      }
    }

    return obj;
  }; // Join array of chunks to single array.


  var flattenChunks = function flattenChunks(chunks) {
    // calculate data length
    var len = 0;

    for (var i = 0, l = chunks.length; i < l; i++) {
      len += chunks[i].length;
    } // join chunks


    var result = new Uint8Array(len);

    for (var _i = 0, pos = 0, _l = chunks.length; _i < _l; _i++) {
      var chunk = chunks[_i];
      result.set(chunk, pos);
      pos += chunk.length;
    }

    return result;
  };

  var common = {
    assign: assign,
    flattenChunks: flattenChunks
  };

  // String encode/decode helpers
  //
  // - apply(Array) can fail on Android 2.2
  // - apply(Uint8Array) can fail on iOS 5.1 Safari
  //

  var STR_APPLY_UIA_OK = true;

  try {
    String.fromCharCode.apply(null, new Uint8Array(1));
  } catch (__) {
    STR_APPLY_UIA_OK = false;
  } // Table with utf8 lengths (calculated by first byte of sequence)
  // Note, that 5 & 6-byte values and some 4-byte values can not be represented in JS,
  // because max possible codepoint is 0x10ffff


  var _utf8len = new Uint8Array(256);

  for (var q = 0; q < 256; q++) {
    _utf8len[q] = q >= 252 ? 6 : q >= 248 ? 5 : q >= 240 ? 4 : q >= 224 ? 3 : q >= 192 ? 2 : 1;
  }

  _utf8len[254] = _utf8len[254] = 1; // Invalid sequence start
  // convert string to array (typed, when possible)

  var string2buf = function string2buf(str) {
    if (typeof TextEncoder === 'function' && TextEncoder.prototype.encode) {
      return new TextEncoder().encode(str);
    }

    var buf,
        c,
        c2,
        m_pos,
        i,
        str_len = str.length,
        buf_len = 0; // count binary size

    for (m_pos = 0; m_pos < str_len; m_pos++) {
      c = str.charCodeAt(m_pos);

      if ((c & 0xfc00) === 0xd800 && m_pos + 1 < str_len) {
        c2 = str.charCodeAt(m_pos + 1);

        if ((c2 & 0xfc00) === 0xdc00) {
          c = 0x10000 + (c - 0xd800 << 10) + (c2 - 0xdc00);
          m_pos++;
        }
      }

      buf_len += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
    } // allocate buffer


    buf = new Uint8Array(buf_len); // convert

    for (i = 0, m_pos = 0; i < buf_len; m_pos++) {
      c = str.charCodeAt(m_pos);

      if ((c & 0xfc00) === 0xd800 && m_pos + 1 < str_len) {
        c2 = str.charCodeAt(m_pos + 1);

        if ((c2 & 0xfc00) === 0xdc00) {
          c = 0x10000 + (c - 0xd800 << 10) + (c2 - 0xdc00);
          m_pos++;
        }
      }

      if (c < 0x80) {
        /* one byte */
        buf[i++] = c;
      } else if (c < 0x800) {
        /* two bytes */
        buf[i++] = 0xC0 | c >>> 6;
        buf[i++] = 0x80 | c & 0x3f;
      } else if (c < 0x10000) {
        /* three bytes */
        buf[i++] = 0xE0 | c >>> 12;
        buf[i++] = 0x80 | c >>> 6 & 0x3f;
        buf[i++] = 0x80 | c & 0x3f;
      } else {
        /* four bytes */
        buf[i++] = 0xf0 | c >>> 18;
        buf[i++] = 0x80 | c >>> 12 & 0x3f;
        buf[i++] = 0x80 | c >>> 6 & 0x3f;
        buf[i++] = 0x80 | c & 0x3f;
      }
    }

    return buf;
  }; // Helper


  var buf2binstring = function buf2binstring(buf, len) {
    // On Chrome, the arguments in a function call that are allowed is `65534`.
    // If the length of the buffer is smaller than that, we can use this optimization,
    // otherwise we will take a slower path.
    if (len < 65534) {
      if (buf.subarray && STR_APPLY_UIA_OK) {
        return String.fromCharCode.apply(null, buf.length === len ? buf : buf.subarray(0, len));
      }
    }

    var result = '';

    for (var i = 0; i < len; i++) {
      result += String.fromCharCode(buf[i]);
    }

    return result;
  }; // convert array to string


  var buf2string = function buf2string(buf, max) {
    var len = max || buf.length;

    if (typeof TextDecoder === 'function' && TextDecoder.prototype.decode) {
      return new TextDecoder().decode(buf.subarray(0, max));
    }

    var i, out; // Reserve max possible length (2 words per char)
    // NB: by unknown reasons, Array is significantly faster for
    //     String.fromCharCode.apply than Uint16Array.

    var utf16buf = new Array(len * 2);

    for (out = 0, i = 0; i < len;) {
      var c = buf[i++]; // quick process ascii

      if (c < 0x80) {
        utf16buf[out++] = c;
        continue;
      }

      var c_len = _utf8len[c]; // skip 5 & 6 byte codes

      if (c_len > 4) {
        utf16buf[out++] = 0xfffd;
        i += c_len - 1;
        continue;
      } // apply mask on first byte


      c &= c_len === 2 ? 0x1f : c_len === 3 ? 0x0f : 0x07; // join the rest

      while (c_len > 1 && i < len) {
        c = c << 6 | buf[i++] & 0x3f;
        c_len--;
      } // terminated by end of string?


      if (c_len > 1) {
        utf16buf[out++] = 0xfffd;
        continue;
      }

      if (c < 0x10000) {
        utf16buf[out++] = c;
      } else {
        c -= 0x10000;
        utf16buf[out++] = 0xd800 | c >> 10 & 0x3ff;
        utf16buf[out++] = 0xdc00 | c & 0x3ff;
      }
    }

    return buf2binstring(utf16buf, out);
  }; // Calculate max possible position in utf8 buffer,
  // that will not break sequence. If that's not possible
  // - (very small limits) return max size as is.
  //
  // buf[] - utf8 bytes array
  // max   - length limit (mandatory);


  var utf8border = function utf8border(buf, max) {
    max = max || buf.length;

    if (max > buf.length) {
      max = buf.length;
    } // go back from last position, until start of sequence found


    var pos = max - 1;

    while (pos >= 0 && (buf[pos] & 0xC0) === 0x80) {
      pos--;
    } // Very small and broken sequence,
    // return max, because we should return something anyway.


    if (pos < 0) {
      return max;
    } // If we came to start of buffer - that means buffer is too small,
    // return max too.


    if (pos === 0) {
      return max;
    }

    return pos + _utf8len[buf[pos]] > max ? pos : max;
  };

  var strings = {
    string2buf: string2buf,
    buf2string: buf2string,
    utf8border: utf8border
  };

  // (C) 2014-2017 Vitaly Puzrin and Andrey Tupitsin
  //
  // This software is provided 'as-is', without any express or implied
  // warranty. In no event will the authors be held liable for any damages
  // arising from the use of this software.
  //
  // Permission is granted to anyone to use this software for any purpose,
  // including commercial applications, and to alter it and redistribute it
  // freely, subject to the following restrictions:
  //
  // 1. The origin of this software must not be misrepresented; you must not
  //   claim that you wrote the original software. If you use this software
  //   in a product, an acknowledgment in the product documentation would be
  //   appreciated but is not required.
  // 2. Altered source versions must be plainly marked as such, and must not be
  //   misrepresented as being the original software.
  // 3. This notice may not be removed or altered from any source distribution.

  function ZStream() {
    /* next input byte */
    this.input = null; // JS specific, because we have no pointers

    this.next_in = 0;
    /* number of bytes available at input */

    this.avail_in = 0;
    /* total number of input bytes read so far */

    this.total_in = 0;
    /* next output byte should be put there */

    this.output = null; // JS specific, because we have no pointers

    this.next_out = 0;
    /* remaining free space at output */

    this.avail_out = 0;
    /* total number of bytes output so far */

    this.total_out = 0;
    /* last error message, NULL if no error */

    this.msg = ''
    /*Z_NULL*/
    ;
    /* not visible by applications */

    this.state = null;
    /* best guess about the data type: binary or text */

    this.data_type = 2
    /*Z_UNKNOWN*/
    ;
    /* adler32 value of the uncompressed data */

    this.adler = 0;
  }

  var zstream = ZStream;

  var toString$1 = Object.prototype.toString;
  /* Public constants ==========================================================*/

  /* ===========================================================================*/

  var Z_NO_FLUSH$1 = constants$2.Z_NO_FLUSH,
      Z_SYNC_FLUSH = constants$2.Z_SYNC_FLUSH,
      Z_FULL_FLUSH = constants$2.Z_FULL_FLUSH,
      Z_FINISH$2 = constants$2.Z_FINISH,
      Z_OK$2 = constants$2.Z_OK,
      Z_STREAM_END$2 = constants$2.Z_STREAM_END,
      Z_DEFAULT_COMPRESSION = constants$2.Z_DEFAULT_COMPRESSION,
      Z_DEFAULT_STRATEGY = constants$2.Z_DEFAULT_STRATEGY,
      Z_DEFLATED$1 = constants$2.Z_DEFLATED;
  /* ===========================================================================*/

  /**
   * class Deflate
   *
   * Generic JS-style wrapper for zlib calls. If you don't need
   * streaming behaviour - use more simple functions: [[deflate]],
   * [[deflateRaw]] and [[gzip]].
   **/

  /* internal
   * Deflate.chunks -> Array
   *
   * Chunks of output data, if [[Deflate#onData]] not overridden.
   **/

  /**
   * Deflate.result -> Uint8Array
   *
   * Compressed result, generated by default [[Deflate#onData]]
   * and [[Deflate#onEnd]] handlers. Filled after you push last chunk
   * (call [[Deflate#push]] with `Z_FINISH` / `true` param).
   **/

  /**
   * Deflate.err -> Number
   *
   * Error code after deflate finished. 0 (Z_OK) on success.
   * You will not need it in real life, because deflate errors
   * are possible only on wrong options or bad `onData` / `onEnd`
   * custom handlers.
   **/

  /**
   * Deflate.msg -> String
   *
   * Error message, if [[Deflate.err]] != 0
   **/

  /**
   * new Deflate(options)
   * - options (Object): zlib deflate options.
   *
   * Creates new deflator instance with specified params. Throws exception
   * on bad params. Supported options:
   *
   * - `level`
   * - `windowBits`
   * - `memLevel`
   * - `strategy`
   * - `dictionary`
   *
   * [http://zlib.net/manual.html#Advanced](http://zlib.net/manual.html#Advanced)
   * for more information on these.
   *
   * Additional options, for internal needs:
   *
   * - `chunkSize` - size of generated data chunks (16K by default)
   * - `raw` (Boolean) - do raw deflate
   * - `gzip` (Boolean) - create gzip wrapper
   * - `header` (Object) - custom header for gzip
   *   - `text` (Boolean) - true if compressed data believed to be text
   *   - `time` (Number) - modification time, unix timestamp
   *   - `os` (Number) - operation system code
   *   - `extra` (Array) - array of bytes with extra data (max 65536)
   *   - `name` (String) - file name (binary string)
   *   - `comment` (String) - comment (binary string)
   *   - `hcrc` (Boolean) - true if header crc should be added
   *
   * ##### Example:
   *
   * ```javascript
   * const pako = require('pako')
   *   , chunk1 = new Uint8Array([1,2,3,4,5,6,7,8,9])
   *   , chunk2 = new Uint8Array([10,11,12,13,14,15,16,17,18,19]);
   *
   * const deflate = new pako.Deflate({ level: 3});
   *
   * deflate.push(chunk1, false);
   * deflate.push(chunk2, true);  // true -> last chunk
   *
   * if (deflate.err) { throw new Error(deflate.err); }
   *
   * console.log(deflate.result);
   * ```
   **/

  function Deflate$1(options) {
    this.options = common.assign({
      level: Z_DEFAULT_COMPRESSION,
      method: Z_DEFLATED$1,
      chunkSize: 16384,
      windowBits: 15,
      memLevel: 8,
      strategy: Z_DEFAULT_STRATEGY
    }, options || {});
    var opt = this.options;

    if (opt.raw && opt.windowBits > 0) {
      opt.windowBits = -opt.windowBits;
    } else if (opt.gzip && opt.windowBits > 0 && opt.windowBits < 16) {
      opt.windowBits += 16;
    }

    this.err = 0; // error code, if happens (0 = Z_OK)

    this.msg = ''; // error message

    this.ended = false; // used to avoid multiple onEnd() calls

    this.chunks = []; // chunks of compressed data

    this.strm = new zstream();
    this.strm.avail_out = 0;
    var status = deflate_1$2.deflateInit2(this.strm, opt.level, opt.method, opt.windowBits, opt.memLevel, opt.strategy);

    if (status !== Z_OK$2) {
      throw new Error(messages[status]);
    }

    if (opt.header) {
      deflate_1$2.deflateSetHeader(this.strm, opt.header);
    }

    if (opt.dictionary) {
      var dict; // Convert data if needed

      if (typeof opt.dictionary === 'string') {
        // If we need to compress text, change encoding to utf8.
        dict = strings.string2buf(opt.dictionary);
      } else if (toString$1.call(opt.dictionary) === '[object ArrayBuffer]') {
        dict = new Uint8Array(opt.dictionary);
      } else {
        dict = opt.dictionary;
      }

      status = deflate_1$2.deflateSetDictionary(this.strm, dict);

      if (status !== Z_OK$2) {
        throw new Error(messages[status]);
      }

      this._dict_set = true;
    }
  }
  /**
   * Deflate#push(data[, flush_mode]) -> Boolean
   * - data (Uint8Array|ArrayBuffer|String): input data. Strings will be
   *   converted to utf8 byte sequence.
   * - flush_mode (Number|Boolean): 0..6 for corresponding Z_NO_FLUSH..Z_TREE modes.
   *   See constants. Skipped or `false` means Z_NO_FLUSH, `true` means Z_FINISH.
   *
   * Sends input data to deflate pipe, generating [[Deflate#onData]] calls with
   * new compressed chunks. Returns `true` on success. The last data block must
   * have `flush_mode` Z_FINISH (or `true`). That will flush internal pending
   * buffers and call [[Deflate#onEnd]].
   *
   * On fail call [[Deflate#onEnd]] with error code and return false.
   *
   * ##### Example
   *
   * ```javascript
   * push(chunk, false); // push one of data chunks
   * ...
   * push(chunk, true);  // push last chunk
   * ```
   **/


  Deflate$1.prototype.push = function (data, flush_mode) {
    var strm = this.strm;
    var chunkSize = this.options.chunkSize;

    var status, _flush_mode;

    if (this.ended) {
      return false;
    }

    if (flush_mode === ~~flush_mode) _flush_mode = flush_mode;else _flush_mode = flush_mode === true ? Z_FINISH$2 : Z_NO_FLUSH$1; // Convert data if needed

    if (typeof data === 'string') {
      // If we need to compress text, change encoding to utf8.
      strm.input = strings.string2buf(data);
    } else if (toString$1.call(data) === '[object ArrayBuffer]') {
      strm.input = new Uint8Array(data);
    } else {
      strm.input = data;
    }

    strm.next_in = 0;
    strm.avail_in = strm.input.length;

    for (;;) {
      if (strm.avail_out === 0) {
        strm.output = new Uint8Array(chunkSize);
        strm.next_out = 0;
        strm.avail_out = chunkSize;
      } // Make sure avail_out > 6 to avoid repeating markers


      if ((_flush_mode === Z_SYNC_FLUSH || _flush_mode === Z_FULL_FLUSH) && strm.avail_out <= 6) {
        this.onData(strm.output.subarray(0, strm.next_out));
        strm.avail_out = 0;
        continue;
      }

      status = deflate_1$2.deflate(strm, _flush_mode); // Ended => flush and finish

      if (status === Z_STREAM_END$2) {
        if (strm.next_out > 0) {
          this.onData(strm.output.subarray(0, strm.next_out));
        }

        status = deflate_1$2.deflateEnd(this.strm);
        this.onEnd(status);
        this.ended = true;
        return status === Z_OK$2;
      } // Flush if out buffer full


      if (strm.avail_out === 0) {
        this.onData(strm.output);
        continue;
      } // Flush if requested and has data


      if (_flush_mode > 0 && strm.next_out > 0) {
        this.onData(strm.output.subarray(0, strm.next_out));
        strm.avail_out = 0;
        continue;
      }

      if (strm.avail_in === 0) break;
    }

    return true;
  };
  /**
   * Deflate#onData(chunk) -> Void
   * - chunk (Uint8Array): output data.
   *
   * By default, stores data blocks in `chunks[]` property and glue
   * those in `onEnd`. Override this handler, if you need another behaviour.
   **/


  Deflate$1.prototype.onData = function (chunk) {
    this.chunks.push(chunk);
  };
  /**
   * Deflate#onEnd(status) -> Void
   * - status (Number): deflate status. 0 (Z_OK) on success,
   *   other if not.
   *
   * Called once after you tell deflate that the input stream is
   * complete (Z_FINISH). By default - join collected chunks,
   * free memory and fill `results` / `err` properties.
   **/


  Deflate$1.prototype.onEnd = function (status) {
    // On success - join
    if (status === Z_OK$2) {
      this.result = common.flattenChunks(this.chunks);
    }

    this.chunks = [];
    this.err = status;
    this.msg = this.strm.msg;
  };
  /**
   * deflate(data[, options]) -> Uint8Array
   * - data (Uint8Array|String): input data to compress.
   * - options (Object): zlib deflate options.
   *
   * Compress `data` with deflate algorithm and `options`.
   *
   * Supported options are:
   *
   * - level
   * - windowBits
   * - memLevel
   * - strategy
   * - dictionary
   *
   * [http://zlib.net/manual.html#Advanced](http://zlib.net/manual.html#Advanced)
   * for more information on these.
   *
   * Sugar (options):
   *
   * - `raw` (Boolean) - say that we work with raw stream, if you don't wish to specify
   *   negative windowBits implicitly.
   *
   * ##### Example:
   *
   * ```javascript
   * const pako = require('pako')
   * const data = new Uint8Array([1,2,3,4,5,6,7,8,9]);
   *
   * console.log(pako.deflate(data));
   * ```
   **/


  function deflate$1(input, options) {
    var deflator = new Deflate$1(options);
    deflator.push(input, true); // That will never happens, if you don't cheat with options :)

    if (deflator.err) {
      throw deflator.msg || messages[deflator.err];
    }

    return deflator.result;
  }
  /**
   * deflateRaw(data[, options]) -> Uint8Array
   * - data (Uint8Array|String): input data to compress.
   * - options (Object): zlib deflate options.
   *
   * The same as [[deflate]], but creates raw data, without wrapper
   * (header and adler32 crc).
   **/


  function deflateRaw$1(input, options) {
    options = options || {};
    options.raw = true;
    return deflate$1(input, options);
  }
  /**
   * gzip(data[, options]) -> Uint8Array
   * - data (Uint8Array|String): input data to compress.
   * - options (Object): zlib deflate options.
   *
   * The same as [[deflate]], but create gzip wrapper instead of
   * deflate one.
   **/


  function gzip$1(input, options) {
    options = options || {};
    options.gzip = true;
    return deflate$1(input, options);
  }

  var Deflate_1$1 = Deflate$1;
  var deflate_2 = deflate$1;
  var deflateRaw_1$1 = deflateRaw$1;
  var gzip_1$1 = gzip$1;
  var constants$1 = constants$2;
  var deflate_1$1 = {
    Deflate: Deflate_1$1,
    deflate: deflate_2,
    deflateRaw: deflateRaw_1$1,
    gzip: gzip_1$1,
    constants: constants$1
  };

  // (C) 2014-2017 Vitaly Puzrin and Andrey Tupitsin
  //
  // This software is provided 'as-is', without any express or implied
  // warranty. In no event will the authors be held liable for any damages
  // arising from the use of this software.
  //
  // Permission is granted to anyone to use this software for any purpose,
  // including commercial applications, and to alter it and redistribute it
  // freely, subject to the following restrictions:
  //
  // 1. The origin of this software must not be misrepresented; you must not
  //   claim that you wrote the original software. If you use this software
  //   in a product, an acknowledgment in the product documentation would be
  //   appreciated but is not required.
  // 2. Altered source versions must be plainly marked as such, and must not be
  //   misrepresented as being the original software.
  // 3. This notice may not be removed or altered from any source distribution.
  // See state defs from inflate.js

  var BAD$1 = 30;
  /* got a data error -- remain here until reset */

  var TYPE$1 = 12;
  /* i: waiting for type bits, including last-flag bit */

  /*
     Decode literal, length, and distance codes and write out the resulting
     literal and match bytes until either not enough input or output is
     available, an end-of-block is encountered, or a data error is encountered.
     When large enough input and output buffers are supplied to inflate(), for
     example, a 16K input buffer and a 64K output buffer, more than 95% of the
     inflate execution time is spent in this routine.

     Entry assumptions:

          state.mode === LEN
          strm.avail_in >= 6
          strm.avail_out >= 258
          start >= strm.avail_out
          state.bits < 8

     On return, state.mode is one of:

          LEN -- ran out of enough output space or enough available input
          TYPE -- reached end of block code, inflate() to interpret next block
          BAD -- error in block data

     Notes:

      - The maximum input bits used by a length/distance pair is 15 bits for the
        length code, 5 bits for the length extra, 15 bits for the distance code,
        and 13 bits for the distance extra.  This totals 48 bits, or six bytes.
        Therefore if strm.avail_in >= 6, then there is enough input to avoid
        checking for available input while decoding.

      - The maximum bytes that a single length/distance pair can output is 258
        bytes, which is the maximum length that can be coded.  inflate_fast()
        requires strm.avail_out >= 258 for each loop to avoid checking for
        output space.
   */

  var inffast = function inflate_fast(strm, start) {
    var _in;
    /* local strm.input */


    var last;
    /* have enough input while in < last */

    var _out;
    /* local strm.output */


    var beg;
    /* inflate()'s initial strm.output */

    var end;
    /* while out < end, enough space available */
    //#ifdef INFLATE_STRICT

    var dmax;
    /* maximum distance from zlib header */
    //#endif

    var wsize;
    /* window size or zero if not using window */

    var whave;
    /* valid bytes in the window */

    var wnext;
    /* window write index */
    // Use `s_window` instead `window`, avoid conflict with instrumentation tools

    var s_window;
    /* allocated sliding window, if wsize != 0 */

    var hold;
    /* local strm.hold */

    var bits;
    /* local strm.bits */

    var lcode;
    /* local strm.lencode */

    var dcode;
    /* local strm.distcode */

    var lmask;
    /* mask for first level of length codes */

    var dmask;
    /* mask for first level of distance codes */

    var here;
    /* retrieved table entry */

    var op;
    /* code bits, operation, extra bits, or */

    /*  window position, window bytes to copy */

    var len;
    /* match length, unused bytes */

    var dist;
    /* match distance */

    var from;
    /* where to copy match from */

    var from_source;
    var input, output; // JS specific, because we have no pointers

    /* copy state to local variables */

    var state = strm.state; //here = state.here;

    _in = strm.next_in;
    input = strm.input;
    last = _in + (strm.avail_in - 5);
    _out = strm.next_out;
    output = strm.output;
    beg = _out - (start - strm.avail_out);
    end = _out + (strm.avail_out - 257); //#ifdef INFLATE_STRICT

    dmax = state.dmax; //#endif

    wsize = state.wsize;
    whave = state.whave;
    wnext = state.wnext;
    s_window = state.window;
    hold = state.hold;
    bits = state.bits;
    lcode = state.lencode;
    dcode = state.distcode;
    lmask = (1 << state.lenbits) - 1;
    dmask = (1 << state.distbits) - 1;
    /* decode literals and length/distances until end-of-block or not enough
       input data or output space */

    top: do {
      if (bits < 15) {
        hold += input[_in++] << bits;
        bits += 8;
        hold += input[_in++] << bits;
        bits += 8;
      }

      here = lcode[hold & lmask];

      dolen: for (;;) {
        // Goto emulation
        op = here >>> 24
        /*here.bits*/
        ;
        hold >>>= op;
        bits -= op;
        op = here >>> 16 & 0xff
        /*here.op*/
        ;

        if (op === 0) {
          /* literal */
          //Tracevv((stderr, here.val >= 0x20 && here.val < 0x7f ?
          //        "inflate:         literal '%c'\n" :
          //        "inflate:         literal 0x%02x\n", here.val));
          output[_out++] = here & 0xffff
          /*here.val*/
          ;
        } else if (op & 16) {
          /* length base */
          len = here & 0xffff
          /*here.val*/
          ;
          op &= 15;
          /* number of extra bits */

          if (op) {
            if (bits < op) {
              hold += input[_in++] << bits;
              bits += 8;
            }

            len += hold & (1 << op) - 1;
            hold >>>= op;
            bits -= op;
          } //Tracevv((stderr, "inflate:         length %u\n", len));


          if (bits < 15) {
            hold += input[_in++] << bits;
            bits += 8;
            hold += input[_in++] << bits;
            bits += 8;
          }

          here = dcode[hold & dmask];

          dodist: for (;;) {
            // goto emulation
            op = here >>> 24
            /*here.bits*/
            ;
            hold >>>= op;
            bits -= op;
            op = here >>> 16 & 0xff
            /*here.op*/
            ;

            if (op & 16) {
              /* distance base */
              dist = here & 0xffff
              /*here.val*/
              ;
              op &= 15;
              /* number of extra bits */

              if (bits < op) {
                hold += input[_in++] << bits;
                bits += 8;

                if (bits < op) {
                  hold += input[_in++] << bits;
                  bits += 8;
                }
              }

              dist += hold & (1 << op) - 1; //#ifdef INFLATE_STRICT

              if (dist > dmax) {
                strm.msg = 'invalid distance too far back';
                state.mode = BAD$1;
                break top;
              } //#endif


              hold >>>= op;
              bits -= op; //Tracevv((stderr, "inflate:         distance %u\n", dist));

              op = _out - beg;
              /* max distance in output */

              if (dist > op) {
                /* see if copy from window */
                op = dist - op;
                /* distance back in window */

                if (op > whave) {
                  if (state.sane) {
                    strm.msg = 'invalid distance too far back';
                    state.mode = BAD$1;
                    break top;
                  } // (!) This block is disabled in zlib defaults,
                  // don't enable it for binary compatibility
                  //#ifdef INFLATE_ALLOW_INVALID_DISTANCE_TOOFAR_ARRR
                  //                if (len <= op - whave) {
                  //                  do {
                  //                    output[_out++] = 0;
                  //                  } while (--len);
                  //                  continue top;
                  //                }
                  //                len -= op - whave;
                  //                do {
                  //                  output[_out++] = 0;
                  //                } while (--op > whave);
                  //                if (op === 0) {
                  //                  from = _out - dist;
                  //                  do {
                  //                    output[_out++] = output[from++];
                  //                  } while (--len);
                  //                  continue top;
                  //                }
                  //#endif

                }

                from = 0; // window index

                from_source = s_window;

                if (wnext === 0) {
                  /* very common case */
                  from += wsize - op;

                  if (op < len) {
                    /* some from window */
                    len -= op;

                    do {
                      output[_out++] = s_window[from++];
                    } while (--op);

                    from = _out - dist;
                    /* rest from output */

                    from_source = output;
                  }
                } else if (wnext < op) {
                  /* wrap around window */
                  from += wsize + wnext - op;
                  op -= wnext;

                  if (op < len) {
                    /* some from end of window */
                    len -= op;

                    do {
                      output[_out++] = s_window[from++];
                    } while (--op);

                    from = 0;

                    if (wnext < len) {
                      /* some from start of window */
                      op = wnext;
                      len -= op;

                      do {
                        output[_out++] = s_window[from++];
                      } while (--op);

                      from = _out - dist;
                      /* rest from output */

                      from_source = output;
                    }
                  }
                } else {
                  /* contiguous in window */
                  from += wnext - op;

                  if (op < len) {
                    /* some from window */
                    len -= op;

                    do {
                      output[_out++] = s_window[from++];
                    } while (--op);

                    from = _out - dist;
                    /* rest from output */

                    from_source = output;
                  }
                }

                while (len > 2) {
                  output[_out++] = from_source[from++];
                  output[_out++] = from_source[from++];
                  output[_out++] = from_source[from++];
                  len -= 3;
                }

                if (len) {
                  output[_out++] = from_source[from++];

                  if (len > 1) {
                    output[_out++] = from_source[from++];
                  }
                }
              } else {
                from = _out - dist;
                /* copy direct from output */

                do {
                  /* minimum length is three */
                  output[_out++] = output[from++];
                  output[_out++] = output[from++];
                  output[_out++] = output[from++];
                  len -= 3;
                } while (len > 2);

                if (len) {
                  output[_out++] = output[from++];

                  if (len > 1) {
                    output[_out++] = output[from++];
                  }
                }
              }
            } else if ((op & 64) === 0) {
              /* 2nd level distance code */
              here = dcode[(here & 0xffff) + (hold & (1 << op) - 1)];
              continue dodist;
            } else {
              strm.msg = 'invalid distance code';
              state.mode = BAD$1;
              break top;
            }

            break; // need to emulate goto via "continue"
          }
        } else if ((op & 64) === 0) {
          /* 2nd level length code */
          here = lcode[(here & 0xffff) + (hold & (1 << op) - 1)];
          continue dolen;
        } else if (op & 32) {
          /* end-of-block */
          //Tracevv((stderr, "inflate:         end of block\n"));
          state.mode = TYPE$1;
          break top;
        } else {
          strm.msg = 'invalid literal/length code';
          state.mode = BAD$1;
          break top;
        }

        break; // need to emulate goto via "continue"
      }
    } while (_in < last && _out < end);
    /* return unused bytes (on entry, bits < 8, so in won't go too far back) */


    len = bits >> 3;
    _in -= len;
    bits -= len << 3;
    hold &= (1 << bits) - 1;
    /* update state and return */

    strm.next_in = _in;
    strm.next_out = _out;
    strm.avail_in = _in < last ? 5 + (last - _in) : 5 - (_in - last);
    strm.avail_out = _out < end ? 257 + (end - _out) : 257 - (_out - end);
    state.hold = hold;
    state.bits = bits;
    return;
  };

  // (C) 2014-2017 Vitaly Puzrin and Andrey Tupitsin
  //
  // This software is provided 'as-is', without any express or implied
  // warranty. In no event will the authors be held liable for any damages
  // arising from the use of this software.
  //
  // Permission is granted to anyone to use this software for any purpose,
  // including commercial applications, and to alter it and redistribute it
  // freely, subject to the following restrictions:
  //
  // 1. The origin of this software must not be misrepresented; you must not
  //   claim that you wrote the original software. If you use this software
  //   in a product, an acknowledgment in the product documentation would be
  //   appreciated but is not required.
  // 2. Altered source versions must be plainly marked as such, and must not be
  //   misrepresented as being the original software.
  // 3. This notice may not be removed or altered from any source distribution.

  var MAXBITS = 15;
  var ENOUGH_LENS$1 = 852;
  var ENOUGH_DISTS$1 = 592; //const ENOUGH = (ENOUGH_LENS+ENOUGH_DISTS);

  var CODES$1 = 0;
  var LENS$1 = 1;
  var DISTS$1 = 2;
  var lbase = new Uint16Array([
  /* Length codes 257..285 base */
  3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258, 0, 0]);
  var lext = new Uint8Array([
  /* Length codes 257..285 extra */
  16, 16, 16, 16, 16, 16, 16, 16, 17, 17, 17, 17, 18, 18, 18, 18, 19, 19, 19, 19, 20, 20, 20, 20, 21, 21, 21, 21, 16, 72, 78]);
  var dbase = new Uint16Array([
  /* Distance codes 0..29 base */
  1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577, 0, 0]);
  var dext = new Uint8Array([
  /* Distance codes 0..29 extra */
  16, 16, 16, 16, 17, 17, 18, 18, 19, 19, 20, 20, 21, 21, 22, 22, 23, 23, 24, 24, 25, 25, 26, 26, 27, 27, 28, 28, 29, 29, 64, 64]);

  var inflate_table = function inflate_table(type, lens, lens_index, codes, table, table_index, work, opts) {
    var bits = opts.bits; //here = opts.here; /* table entry for duplication */

    var len = 0;
    /* a code's length in bits */

    var sym = 0;
    /* index of code symbols */

    var min = 0,
        max = 0;
    /* minimum and maximum code lengths */

    var root = 0;
    /* number of index bits for root table */

    var curr = 0;
    /* number of index bits for current table */

    var drop = 0;
    /* code bits to drop for sub-table */

    var left = 0;
    /* number of prefix codes available */

    var used = 0;
    /* code entries in table used */

    var huff = 0;
    /* Huffman code */

    var incr;
    /* for incrementing code, index */

    var fill;
    /* index for replicating entries */

    var low;
    /* low bits for current root entry */

    var mask;
    /* mask for low root bits */

    var next;
    /* next available space in table */

    var base = null;
    /* base value table to use */

    var base_index = 0; //  let shoextra;    /* extra bits table to use */

    var end;
    /* use base and extra for symbol > end */

    var count = new Uint16Array(MAXBITS + 1); //[MAXBITS+1];    /* number of codes of each length */

    var offs = new Uint16Array(MAXBITS + 1); //[MAXBITS+1];     /* offsets in table for each length */

    var extra = null;
    var extra_index = 0;
    var here_bits, here_op, here_val;
    /*
     Process a set of code lengths to create a canonical Huffman code.  The
     code lengths are lens[0..codes-1].  Each length corresponds to the
     symbols 0..codes-1.  The Huffman code is generated by first sorting the
     symbols by length from short to long, and retaining the symbol order
     for codes with equal lengths.  Then the code starts with all zero bits
     for the first code of the shortest length, and the codes are integer
     increments for the same length, and zeros are appended as the length
     increases.  For the deflate format, these bits are stored backwards
     from their more natural integer increment ordering, and so when the
     decoding tables are built in the large loop below, the integer codes
     are incremented backwards.
      This routine assumes, but does not check, that all of the entries in
     lens[] are in the range 0..MAXBITS.  The caller must assure this.
     1..MAXBITS is interpreted as that code length.  zero means that that
     symbol does not occur in this code.
      The codes are sorted by computing a count of codes for each length,
     creating from that a table of starting indices for each length in the
     sorted table, and then entering the symbols in order in the sorted
     table.  The sorted table is work[], with that space being provided by
     the caller.
      The length counts are used for other purposes as well, i.e. finding
     the minimum and maximum length codes, determining if there are any
     codes at all, checking for a valid set of lengths, and looking ahead
     at length counts to determine sub-table sizes when building the
     decoding tables.
     */

    /* accumulate lengths for codes (assumes lens[] all in 0..MAXBITS) */

    for (len = 0; len <= MAXBITS; len++) {
      count[len] = 0;
    }

    for (sym = 0; sym < codes; sym++) {
      count[lens[lens_index + sym]]++;
    }
    /* bound code lengths, force root to be within code lengths */


    root = bits;

    for (max = MAXBITS; max >= 1; max--) {
      if (count[max] !== 0) {
        break;
      }
    }

    if (root > max) {
      root = max;
    }

    if (max === 0) {
      /* no symbols to code at all */
      //table.op[opts.table_index] = 64;  //here.op = (var char)64;    /* invalid code marker */
      //table.bits[opts.table_index] = 1;   //here.bits = (var char)1;
      //table.val[opts.table_index++] = 0;   //here.val = (var short)0;
      table[table_index++] = 1 << 24 | 64 << 16 | 0; //table.op[opts.table_index] = 64;
      //table.bits[opts.table_index] = 1;
      //table.val[opts.table_index++] = 0;

      table[table_index++] = 1 << 24 | 64 << 16 | 0;
      opts.bits = 1;
      return 0;
      /* no symbols, but wait for decoding to report error */
    }

    for (min = 1; min < max; min++) {
      if (count[min] !== 0) {
        break;
      }
    }

    if (root < min) {
      root = min;
    }
    /* check for an over-subscribed or incomplete set of lengths */


    left = 1;

    for (len = 1; len <= MAXBITS; len++) {
      left <<= 1;
      left -= count[len];

      if (left < 0) {
        return -1;
      }
      /* over-subscribed */

    }

    if (left > 0 && (type === CODES$1 || max !== 1)) {
      return -1;
      /* incomplete set */
    }
    /* generate offsets into symbol table for each length for sorting */


    offs[1] = 0;

    for (len = 1; len < MAXBITS; len++) {
      offs[len + 1] = offs[len] + count[len];
    }
    /* sort symbols by length, by symbol order within each length */


    for (sym = 0; sym < codes; sym++) {
      if (lens[lens_index + sym] !== 0) {
        work[offs[lens[lens_index + sym]]++] = sym;
      }
    }
    /*
     Create and fill in decoding tables.  In this loop, the table being
     filled is at next and has curr index bits.  The code being used is huff
     with length len.  That code is converted to an index by dropping drop
     bits off of the bottom.  For codes where len is less than drop + curr,
     those top drop + curr - len bits are incremented through all values to
     fill the table with replicated entries.
      root is the number of index bits for the root table.  When len exceeds
     root, sub-tables are created pointed to by the root entry with an index
     of the low root bits of huff.  This is saved in low to check for when a
     new sub-table should be started.  drop is zero when the root table is
     being filled, and drop is root when sub-tables are being filled.
      When a new sub-table is needed, it is necessary to look ahead in the
     code lengths to determine what size sub-table is needed.  The length
     counts are used for this, and so count[] is decremented as codes are
     entered in the tables.
      used keeps track of how many table entries have been allocated from the
     provided *table space.  It is checked for LENS and DIST tables against
     the constants ENOUGH_LENS and ENOUGH_DISTS to guard against changes in
     the initial root table size constants.  See the comments in inftrees.h
     for more information.
      sym increments through all symbols, and the loop terminates when
     all codes of length max, i.e. all codes, have been processed.  This
     routine permits incomplete codes, so another loop after this one fills
     in the rest of the decoding tables with invalid code markers.
     */

    /* set up for code type */
    // poor man optimization - use if-else instead of switch,
    // to avoid deopts in old v8


    if (type === CODES$1) {
      base = extra = work;
      /* dummy value--not used */

      end = 19;
    } else if (type === LENS$1) {
      base = lbase;
      base_index -= 257;
      extra = lext;
      extra_index -= 257;
      end = 256;
    } else {
      /* DISTS */
      base = dbase;
      extra = dext;
      end = -1;
    }
    /* initialize opts for loop */


    huff = 0;
    /* starting code */

    sym = 0;
    /* starting code symbol */

    len = min;
    /* starting code length */

    next = table_index;
    /* current table to fill in */

    curr = root;
    /* current table index bits */

    drop = 0;
    /* current bits to drop from code for index */

    low = -1;
    /* trigger new sub-table when len > root */

    used = 1 << root;
    /* use root table entries */

    mask = used - 1;
    /* mask for comparing low */

    /* check available table space */

    if (type === LENS$1 && used > ENOUGH_LENS$1 || type === DISTS$1 && used > ENOUGH_DISTS$1) {
      return 1;
    }
    /* process all codes and make table entries */


    for (;;) {
      /* create table entry */
      here_bits = len - drop;

      if (work[sym] < end) {
        here_op = 0;
        here_val = work[sym];
      } else if (work[sym] > end) {
        here_op = extra[extra_index + work[sym]];
        here_val = base[base_index + work[sym]];
      } else {
        here_op = 32 + 64;
        /* end of block */

        here_val = 0;
      }
      /* replicate for those indices with low len bits equal to huff */


      incr = 1 << len - drop;
      fill = 1 << curr;
      min = fill;
      /* save offset to next table */

      do {
        fill -= incr;
        table[next + (huff >> drop) + fill] = here_bits << 24 | here_op << 16 | here_val | 0;
      } while (fill !== 0);
      /* backwards increment the len-bit code huff */


      incr = 1 << len - 1;

      while (huff & incr) {
        incr >>= 1;
      }

      if (incr !== 0) {
        huff &= incr - 1;
        huff += incr;
      } else {
        huff = 0;
      }
      /* go to next symbol, update count, len */


      sym++;

      if (--count[len] === 0) {
        if (len === max) {
          break;
        }

        len = lens[lens_index + work[sym]];
      }
      /* create new sub-table if needed */


      if (len > root && (huff & mask) !== low) {
        /* if first time, transition to sub-tables */
        if (drop === 0) {
          drop = root;
        }
        /* increment past last table */


        next += min;
        /* here min is 1 << curr */

        /* determine length of next table */

        curr = len - drop;
        left = 1 << curr;

        while (curr + drop < max) {
          left -= count[curr + drop];

          if (left <= 0) {
            break;
          }

          curr++;
          left <<= 1;
        }
        /* check for enough space */


        used += 1 << curr;

        if (type === LENS$1 && used > ENOUGH_LENS$1 || type === DISTS$1 && used > ENOUGH_DISTS$1) {
          return 1;
        }
        /* point entry in root table to sub-table */


        low = huff & mask;
        /*table.op[low] = curr;
        table.bits[low] = root;
        table.val[low] = next - opts.table_index;*/

        table[low] = root << 24 | curr << 16 | next - table_index | 0;
      }
    }
    /* fill in remaining table entry if code is incomplete (guaranteed to have
     at most one remaining entry, since if the code is incomplete, the
     maximum code length that was allowed to get this far is one bit) */


    if (huff !== 0) {
      //table.op[next + huff] = 64;            /* invalid code marker */
      //table.bits[next + huff] = len - drop;
      //table.val[next + huff] = 0;
      table[next + huff] = len - drop << 24 | 64 << 16 | 0;
    }
    /* set return parameters */
    //opts.table_index += used;


    opts.bits = root;
    return 0;
  };

  var inftrees = inflate_table;

  // (C) 2014-2017 Vitaly Puzrin and Andrey Tupitsin
  //
  // This software is provided 'as-is', without any express or implied
  // warranty. In no event will the authors be held liable for any damages
  // arising from the use of this software.
  //
  // Permission is granted to anyone to use this software for any purpose,
  // including commercial applications, and to alter it and redistribute it
  // freely, subject to the following restrictions:
  //
  // 1. The origin of this software must not be misrepresented; you must not
  //   claim that you wrote the original software. If you use this software
  //   in a product, an acknowledgment in the product documentation would be
  //   appreciated but is not required.
  // 2. Altered source versions must be plainly marked as such, and must not be
  //   misrepresented as being the original software.
  // 3. This notice may not be removed or altered from any source distribution.


  var CODES = 0;
  var LENS = 1;
  var DISTS = 2;
  /* Public constants ==========================================================*/

  /* ===========================================================================*/

  var Z_FINISH$1 = constants$2.Z_FINISH,
      Z_BLOCK = constants$2.Z_BLOCK,
      Z_TREES = constants$2.Z_TREES,
      Z_OK$1 = constants$2.Z_OK,
      Z_STREAM_END$1 = constants$2.Z_STREAM_END,
      Z_NEED_DICT$1 = constants$2.Z_NEED_DICT,
      Z_STREAM_ERROR$1 = constants$2.Z_STREAM_ERROR,
      Z_DATA_ERROR$1 = constants$2.Z_DATA_ERROR,
      Z_MEM_ERROR$1 = constants$2.Z_MEM_ERROR,
      Z_BUF_ERROR = constants$2.Z_BUF_ERROR,
      Z_DEFLATED = constants$2.Z_DEFLATED;
  /* STATES ====================================================================*/

  /* ===========================================================================*/

  var HEAD = 1;
  /* i: waiting for magic header */

  var FLAGS = 2;
  /* i: waiting for method and flags (gzip) */

  var TIME = 3;
  /* i: waiting for modification time (gzip) */

  var OS = 4;
  /* i: waiting for extra flags and operating system (gzip) */

  var EXLEN = 5;
  /* i: waiting for extra length (gzip) */

  var EXTRA = 6;
  /* i: waiting for extra bytes (gzip) */

  var NAME = 7;
  /* i: waiting for end of file name (gzip) */

  var COMMENT = 8;
  /* i: waiting for end of comment (gzip) */

  var HCRC = 9;
  /* i: waiting for header crc (gzip) */

  var DICTID = 10;
  /* i: waiting for dictionary check value */

  var DICT = 11;
  /* waiting for inflateSetDictionary() call */

  var TYPE = 12;
  /* i: waiting for type bits, including last-flag bit */

  var TYPEDO = 13;
  /* i: same, but skip check to exit inflate on new block */

  var STORED = 14;
  /* i: waiting for stored size (length and complement) */

  var COPY_ = 15;
  /* i/o: same as COPY below, but only first time in */

  var COPY = 16;
  /* i/o: waiting for input or output to copy stored block */

  var TABLE = 17;
  /* i: waiting for dynamic block table lengths */

  var LENLENS = 18;
  /* i: waiting for code length code lengths */

  var CODELENS = 19;
  /* i: waiting for length/lit and distance code lengths */

  var LEN_ = 20;
  /* i: same as LEN below, but only first time in */

  var LEN = 21;
  /* i: waiting for length/lit/eob code */

  var LENEXT = 22;
  /* i: waiting for length extra bits */

  var DIST = 23;
  /* i: waiting for distance code */

  var DISTEXT = 24;
  /* i: waiting for distance extra bits */

  var MATCH = 25;
  /* o: waiting for output space to copy string */

  var LIT = 26;
  /* o: waiting for output space to write literal */

  var CHECK = 27;
  /* i: waiting for 32-bit check value */

  var LENGTH = 28;
  /* i: waiting for 32-bit length (gzip) */

  var DONE = 29;
  /* finished check, done -- remain here until reset */

  var BAD = 30;
  /* got a data error -- remain here until reset */

  var MEM = 31;
  /* got an inflate() memory error -- remain here until reset */

  var SYNC = 32;
  /* looking for synchronization bytes to restart inflate() */

  /* ===========================================================================*/

  var ENOUGH_LENS = 852;
  var ENOUGH_DISTS = 592; //const ENOUGH =  (ENOUGH_LENS+ENOUGH_DISTS);

  var MAX_WBITS = 15;
  /* 32K LZ77 window */

  var DEF_WBITS = MAX_WBITS;

  var zswap32 = function zswap32(q) {
    return (q >>> 24 & 0xff) + (q >>> 8 & 0xff00) + ((q & 0xff00) << 8) + ((q & 0xff) << 24);
  };

  function InflateState() {
    this.mode = 0;
    /* current inflate mode */

    this.last = false;
    /* true if processing last block */

    this.wrap = 0;
    /* bit 0 true for zlib, bit 1 true for gzip */

    this.havedict = false;
    /* true if dictionary provided */

    this.flags = 0;
    /* gzip header method and flags (0 if zlib) */

    this.dmax = 0;
    /* zlib header max distance (INFLATE_STRICT) */

    this.check = 0;
    /* protected copy of check value */

    this.total = 0;
    /* protected copy of output count */
    // TODO: may be {}

    this.head = null;
    /* where to save gzip header information */

    /* sliding window */

    this.wbits = 0;
    /* log base 2 of requested window size */

    this.wsize = 0;
    /* window size or zero if not using window */

    this.whave = 0;
    /* valid bytes in the window */

    this.wnext = 0;
    /* window write index */

    this.window = null;
    /* allocated sliding window, if needed */

    /* bit accumulator */

    this.hold = 0;
    /* input bit accumulator */

    this.bits = 0;
    /* number of bits in "in" */

    /* for string and stored block copying */

    this.length = 0;
    /* literal or length of data to copy */

    this.offset = 0;
    /* distance back to copy string from */

    /* for table and code decoding */

    this.extra = 0;
    /* extra bits needed */

    /* fixed and dynamic code tables */

    this.lencode = null;
    /* starting table for length/literal codes */

    this.distcode = null;
    /* starting table for distance codes */

    this.lenbits = 0;
    /* index bits for lencode */

    this.distbits = 0;
    /* index bits for distcode */

    /* dynamic table building */

    this.ncode = 0;
    /* number of code length code lengths */

    this.nlen = 0;
    /* number of length code lengths */

    this.ndist = 0;
    /* number of distance code lengths */

    this.have = 0;
    /* number of code lengths in lens[] */

    this.next = null;
    /* next available space in codes[] */

    this.lens = new Uint16Array(320);
    /* temporary storage for code lengths */

    this.work = new Uint16Array(288);
    /* work area for code table building */

    /*
     because we don't have pointers in js, we use lencode and distcode directly
     as buffers so we don't need codes
    */
    //this.codes = new Int32Array(ENOUGH);       /* space for code tables */

    this.lendyn = null;
    /* dynamic table for length/literal codes (JS specific) */

    this.distdyn = null;
    /* dynamic table for distance codes (JS specific) */

    this.sane = 0;
    /* if false, allow invalid distance too far */

    this.back = 0;
    /* bits back of last unprocessed length/lit */

    this.was = 0;
    /* initial length of match */
  }

  var inflateResetKeep = function inflateResetKeep(strm) {
    if (!strm || !strm.state) {
      return Z_STREAM_ERROR$1;
    }

    var state = strm.state;
    strm.total_in = strm.total_out = state.total = 0;
    strm.msg = '';
    /*Z_NULL*/

    if (state.wrap) {
      /* to support ill-conceived Java test suite */
      strm.adler = state.wrap & 1;
    }

    state.mode = HEAD;
    state.last = 0;
    state.havedict = 0;
    state.dmax = 32768;
    state.head = null
    /*Z_NULL*/
    ;
    state.hold = 0;
    state.bits = 0; //state.lencode = state.distcode = state.next = state.codes;

    state.lencode = state.lendyn = new Int32Array(ENOUGH_LENS);
    state.distcode = state.distdyn = new Int32Array(ENOUGH_DISTS);
    state.sane = 1;
    state.back = -1; //Tracev((stderr, "inflate: reset\n"));

    return Z_OK$1;
  };

  var inflateReset = function inflateReset(strm) {
    if (!strm || !strm.state) {
      return Z_STREAM_ERROR$1;
    }

    var state = strm.state;
    state.wsize = 0;
    state.whave = 0;
    state.wnext = 0;
    return inflateResetKeep(strm);
  };

  var inflateReset2 = function inflateReset2(strm, windowBits) {
    var wrap;
    /* get the state */

    if (!strm || !strm.state) {
      return Z_STREAM_ERROR$1;
    }

    var state = strm.state;
    /* extract wrap request from windowBits parameter */

    if (windowBits < 0) {
      wrap = 0;
      windowBits = -windowBits;
    } else {
      wrap = (windowBits >> 4) + 1;

      if (windowBits < 48) {
        windowBits &= 15;
      }
    }
    /* set number of window bits, free window if different */


    if (windowBits && (windowBits < 8 || windowBits > 15)) {
      return Z_STREAM_ERROR$1;
    }

    if (state.window !== null && state.wbits !== windowBits) {
      state.window = null;
    }
    /* update state and reset the rest of it */


    state.wrap = wrap;
    state.wbits = windowBits;
    return inflateReset(strm);
  };

  var inflateInit2 = function inflateInit2(strm, windowBits) {
    if (!strm) {
      return Z_STREAM_ERROR$1;
    } //strm.msg = Z_NULL;                 /* in case we return an error */


    var state = new InflateState(); //if (state === Z_NULL) return Z_MEM_ERROR;
    //Tracev((stderr, "inflate: allocated\n"));

    strm.state = state;
    state.window = null
    /*Z_NULL*/
    ;
    var ret = inflateReset2(strm, windowBits);

    if (ret !== Z_OK$1) {
      strm.state = null
      /*Z_NULL*/
      ;
    }

    return ret;
  };

  var inflateInit = function inflateInit(strm) {
    return inflateInit2(strm, DEF_WBITS);
  };
  /*
   Return state with length and distance decoding tables and index sizes set to
   fixed code decoding.  Normally this returns fixed tables from inffixed.h.
   If BUILDFIXED is defined, then instead this routine builds the tables the
   first time it's called, and returns those tables the first time and
   thereafter.  This reduces the size of the code by about 2K bytes, in
   exchange for a little execution time.  However, BUILDFIXED should not be
   used for threaded applications, since the rewriting of the tables and virgin
   may not be thread-safe.
   */


  var virgin = true;
  var lenfix, distfix; // We have no pointers in JS, so keep tables separate

  var fixedtables = function fixedtables(state) {
    /* build fixed huffman tables if first call (may not be thread safe) */
    if (virgin) {
      lenfix = new Int32Array(512);
      distfix = new Int32Array(32);
      /* literal/length table */

      var sym = 0;

      while (sym < 144) {
        state.lens[sym++] = 8;
      }

      while (sym < 256) {
        state.lens[sym++] = 9;
      }

      while (sym < 280) {
        state.lens[sym++] = 7;
      }

      while (sym < 288) {
        state.lens[sym++] = 8;
      }

      inftrees(LENS, state.lens, 0, 288, lenfix, 0, state.work, {
        bits: 9
      });
      /* distance table */

      sym = 0;

      while (sym < 32) {
        state.lens[sym++] = 5;
      }

      inftrees(DISTS, state.lens, 0, 32, distfix, 0, state.work, {
        bits: 5
      });
      /* do this just once */

      virgin = false;
    }

    state.lencode = lenfix;
    state.lenbits = 9;
    state.distcode = distfix;
    state.distbits = 5;
  };
  /*
   Update the window with the last wsize (normally 32K) bytes written before
   returning.  If window does not exist yet, create it.  This is only called
   when a window is already in use, or when output has been written during this
   inflate call, but the end of the deflate stream has not been reached yet.
   It is also called to create a window for dictionary data when a dictionary
   is loaded.

   Providing output buffers larger than 32K to inflate() should provide a speed
   advantage, since only the last 32K of output is copied to the sliding window
   upon return from inflate(), and since all distances after the first 32K of
   output will fall in the output data, making match copies simpler and faster.
   The advantage may be dependent on the size of the processor's data caches.
   */


  var updatewindow = function updatewindow(strm, src, end, copy) {
    var dist;
    var state = strm.state;
    /* if it hasn't been done already, allocate space for the window */

    if (state.window === null) {
      state.wsize = 1 << state.wbits;
      state.wnext = 0;
      state.whave = 0;
      state.window = new Uint8Array(state.wsize);
    }
    /* copy state->wsize or less output bytes into the circular window */


    if (copy >= state.wsize) {
      state.window.set(src.subarray(end - state.wsize, end), 0);
      state.wnext = 0;
      state.whave = state.wsize;
    } else {
      dist = state.wsize - state.wnext;

      if (dist > copy) {
        dist = copy;
      } //zmemcpy(state->window + state->wnext, end - copy, dist);


      state.window.set(src.subarray(end - copy, end - copy + dist), state.wnext);
      copy -= dist;

      if (copy) {
        //zmemcpy(state->window, end - copy, copy);
        state.window.set(src.subarray(end - copy, end), 0);
        state.wnext = copy;
        state.whave = state.wsize;
      } else {
        state.wnext += dist;

        if (state.wnext === state.wsize) {
          state.wnext = 0;
        }

        if (state.whave < state.wsize) {
          state.whave += dist;
        }
      }
    }

    return 0;
  };

  var inflate$2 = function inflate(strm, flush) {
    var state;
    var input, output; // input/output buffers

    var next;
    /* next input INDEX */

    var put;
    /* next output INDEX */

    var have, left;
    /* available input and output */

    var hold;
    /* bit buffer */

    var bits;
    /* bits in bit buffer */

    var _in, _out;
    /* save starting available input and output */


    var copy;
    /* number of stored or match bytes to copy */

    var from;
    /* where to copy match bytes from */

    var from_source;
    var here = 0;
    /* current decoding table entry */

    var here_bits, here_op, here_val; // paked "here" denormalized (JS specific)
    //let last;                   /* parent table entry */

    var last_bits, last_op, last_val; // paked "last" denormalized (JS specific)

    var len;
    /* length to copy for repeats, bits to drop */

    var ret;
    /* return code */

    var hbuf = new Uint8Array(4);
    /* buffer for gzip header crc calculation */

    var opts;
    var n; // temporary variable for NEED_BITS

    var order =
    /* permutation of code lengths */
    new Uint8Array([16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15]);

    if (!strm || !strm.state || !strm.output || !strm.input && strm.avail_in !== 0) {
      return Z_STREAM_ERROR$1;
    }

    state = strm.state;

    if (state.mode === TYPE) {
      state.mode = TYPEDO;
    }
    /* skip check */
    //--- LOAD() ---


    put = strm.next_out;
    output = strm.output;
    left = strm.avail_out;
    next = strm.next_in;
    input = strm.input;
    have = strm.avail_in;
    hold = state.hold;
    bits = state.bits; //---

    _in = have;
    _out = left;
    ret = Z_OK$1;

    inf_leave: // goto emulation
    for (;;) {
      switch (state.mode) {
        case HEAD:
          if (state.wrap === 0) {
            state.mode = TYPEDO;
            break;
          } //=== NEEDBITS(16);


          while (bits < 16) {
            if (have === 0) {
              break inf_leave;
            }

            have--;
            hold += input[next++] << bits;
            bits += 8;
          } //===//


          if (state.wrap & 2 && hold === 0x8b1f) {
            /* gzip header */
            state.check = 0
            /*crc32(0L, Z_NULL, 0)*/
            ; //=== CRC2(state.check, hold);

            hbuf[0] = hold & 0xff;
            hbuf[1] = hold >>> 8 & 0xff;
            state.check = crc32_1(state.check, hbuf, 2, 0); //===//
            //=== INITBITS();

            hold = 0;
            bits = 0; //===//

            state.mode = FLAGS;
            break;
          }

          state.flags = 0;
          /* expect zlib header */

          if (state.head) {
            state.head.done = false;
          }

          if (!(state.wrap & 1) ||
          /* check if zlib header allowed */
          (((hold & 0xff) << 8) + (hold >> 8)) % 31) {
            strm.msg = 'incorrect header check';
            state.mode = BAD;
            break;
          }

          if ((hold & 0x0f) !== Z_DEFLATED) {
            strm.msg = 'unknown compression method';
            state.mode = BAD;
            break;
          } //--- DROPBITS(4) ---//


          hold >>>= 4;
          bits -= 4; //---//

          len = (hold & 0x0f) + 8;

          if (state.wbits === 0) {
            state.wbits = len;
          } else if (len > state.wbits) {
            strm.msg = 'invalid window size';
            state.mode = BAD;
            break;
          } // !!! pako patch. Force use `options.windowBits` if passed.
          // Required to always use max window size by default.


          state.dmax = 1 << state.wbits; //state.dmax = 1 << len;
          //Tracev((stderr, "inflate:   zlib header ok\n"));

          strm.adler = state.check = 1
          /*adler32(0L, Z_NULL, 0)*/
          ;
          state.mode = hold & 0x200 ? DICTID : TYPE; //=== INITBITS();

          hold = 0;
          bits = 0; //===//

          break;

        case FLAGS:
          //=== NEEDBITS(16); */
          while (bits < 16) {
            if (have === 0) {
              break inf_leave;
            }

            have--;
            hold += input[next++] << bits;
            bits += 8;
          } //===//


          state.flags = hold;

          if ((state.flags & 0xff) !== Z_DEFLATED) {
            strm.msg = 'unknown compression method';
            state.mode = BAD;
            break;
          }

          if (state.flags & 0xe000) {
            strm.msg = 'unknown header flags set';
            state.mode = BAD;
            break;
          }

          if (state.head) {
            state.head.text = hold >> 8 & 1;
          }

          if (state.flags & 0x0200) {
            //=== CRC2(state.check, hold);
            hbuf[0] = hold & 0xff;
            hbuf[1] = hold >>> 8 & 0xff;
            state.check = crc32_1(state.check, hbuf, 2, 0); //===//
          } //=== INITBITS();


          hold = 0;
          bits = 0; //===//

          state.mode = TIME;

        /* falls through */

        case TIME:
          //=== NEEDBITS(32); */
          while (bits < 32) {
            if (have === 0) {
              break inf_leave;
            }

            have--;
            hold += input[next++] << bits;
            bits += 8;
          } //===//


          if (state.head) {
            state.head.time = hold;
          }

          if (state.flags & 0x0200) {
            //=== CRC4(state.check, hold)
            hbuf[0] = hold & 0xff;
            hbuf[1] = hold >>> 8 & 0xff;
            hbuf[2] = hold >>> 16 & 0xff;
            hbuf[3] = hold >>> 24 & 0xff;
            state.check = crc32_1(state.check, hbuf, 4, 0); //===
          } //=== INITBITS();


          hold = 0;
          bits = 0; //===//

          state.mode = OS;

        /* falls through */

        case OS:
          //=== NEEDBITS(16); */
          while (bits < 16) {
            if (have === 0) {
              break inf_leave;
            }

            have--;
            hold += input[next++] << bits;
            bits += 8;
          } //===//


          if (state.head) {
            state.head.xflags = hold & 0xff;
            state.head.os = hold >> 8;
          }

          if (state.flags & 0x0200) {
            //=== CRC2(state.check, hold);
            hbuf[0] = hold & 0xff;
            hbuf[1] = hold >>> 8 & 0xff;
            state.check = crc32_1(state.check, hbuf, 2, 0); //===//
          } //=== INITBITS();


          hold = 0;
          bits = 0; //===//

          state.mode = EXLEN;

        /* falls through */

        case EXLEN:
          if (state.flags & 0x0400) {
            //=== NEEDBITS(16); */
            while (bits < 16) {
              if (have === 0) {
                break inf_leave;
              }

              have--;
              hold += input[next++] << bits;
              bits += 8;
            } //===//


            state.length = hold;

            if (state.head) {
              state.head.extra_len = hold;
            }

            if (state.flags & 0x0200) {
              //=== CRC2(state.check, hold);
              hbuf[0] = hold & 0xff;
              hbuf[1] = hold >>> 8 & 0xff;
              state.check = crc32_1(state.check, hbuf, 2, 0); //===//
            } //=== INITBITS();


            hold = 0;
            bits = 0; //===//
          } else if (state.head) {
            state.head.extra = null
            /*Z_NULL*/
            ;
          }

          state.mode = EXTRA;

        /* falls through */

        case EXTRA:
          if (state.flags & 0x0400) {
            copy = state.length;

            if (copy > have) {
              copy = have;
            }

            if (copy) {
              if (state.head) {
                len = state.head.extra_len - state.length;

                if (!state.head.extra) {
                  // Use untyped array for more convenient processing later
                  state.head.extra = new Uint8Array(state.head.extra_len);
                }

                state.head.extra.set(input.subarray(next, // extra field is limited to 65536 bytes
                // - no need for additional size check
                next + copy),
                /*len + copy > state.head.extra_max - len ? state.head.extra_max : copy,*/
                len); //zmemcpy(state.head.extra + len, next,
                //        len + copy > state.head.extra_max ?
                //        state.head.extra_max - len : copy);
              }

              if (state.flags & 0x0200) {
                state.check = crc32_1(state.check, input, copy, next);
              }

              have -= copy;
              next += copy;
              state.length -= copy;
            }

            if (state.length) {
              break inf_leave;
            }
          }

          state.length = 0;
          state.mode = NAME;

        /* falls through */

        case NAME:
          if (state.flags & 0x0800) {
            if (have === 0) {
              break inf_leave;
            }

            copy = 0;

            do {
              // TODO: 2 or 1 bytes?
              len = input[next + copy++];
              /* use constant limit because in js we should not preallocate memory */

              if (state.head && len && state.length < 65536
              /*state.head.name_max*/
              ) {
                state.head.name += String.fromCharCode(len);
              }
            } while (len && copy < have);

            if (state.flags & 0x0200) {
              state.check = crc32_1(state.check, input, copy, next);
            }

            have -= copy;
            next += copy;

            if (len) {
              break inf_leave;
            }
          } else if (state.head) {
            state.head.name = null;
          }

          state.length = 0;
          state.mode = COMMENT;

        /* falls through */

        case COMMENT:
          if (state.flags & 0x1000) {
            if (have === 0) {
              break inf_leave;
            }

            copy = 0;

            do {
              len = input[next + copy++];
              /* use constant limit because in js we should not preallocate memory */

              if (state.head && len && state.length < 65536
              /*state.head.comm_max*/
              ) {
                state.head.comment += String.fromCharCode(len);
              }
            } while (len && copy < have);

            if (state.flags & 0x0200) {
              state.check = crc32_1(state.check, input, copy, next);
            }

            have -= copy;
            next += copy;

            if (len) {
              break inf_leave;
            }
          } else if (state.head) {
            state.head.comment = null;
          }

          state.mode = HCRC;

        /* falls through */

        case HCRC:
          if (state.flags & 0x0200) {
            //=== NEEDBITS(16); */
            while (bits < 16) {
              if (have === 0) {
                break inf_leave;
              }

              have--;
              hold += input[next++] << bits;
              bits += 8;
            } //===//


            if (hold !== (state.check & 0xffff)) {
              strm.msg = 'header crc mismatch';
              state.mode = BAD;
              break;
            } //=== INITBITS();


            hold = 0;
            bits = 0; //===//
          }

          if (state.head) {
            state.head.hcrc = state.flags >> 9 & 1;
            state.head.done = true;
          }

          strm.adler = state.check = 0;
          state.mode = TYPE;
          break;

        case DICTID:
          //=== NEEDBITS(32); */
          while (bits < 32) {
            if (have === 0) {
              break inf_leave;
            }

            have--;
            hold += input[next++] << bits;
            bits += 8;
          } //===//


          strm.adler = state.check = zswap32(hold); //=== INITBITS();

          hold = 0;
          bits = 0; //===//

          state.mode = DICT;

        /* falls through */

        case DICT:
          if (state.havedict === 0) {
            //--- RESTORE() ---
            strm.next_out = put;
            strm.avail_out = left;
            strm.next_in = next;
            strm.avail_in = have;
            state.hold = hold;
            state.bits = bits; //---

            return Z_NEED_DICT$1;
          }

          strm.adler = state.check = 1
          /*adler32(0L, Z_NULL, 0)*/
          ;
          state.mode = TYPE;

        /* falls through */

        case TYPE:
          if (flush === Z_BLOCK || flush === Z_TREES) {
            break inf_leave;
          }

        /* falls through */

        case TYPEDO:
          if (state.last) {
            //--- BYTEBITS() ---//
            hold >>>= bits & 7;
            bits -= bits & 7; //---//

            state.mode = CHECK;
            break;
          } //=== NEEDBITS(3); */


          while (bits < 3) {
            if (have === 0) {
              break inf_leave;
            }

            have--;
            hold += input[next++] << bits;
            bits += 8;
          } //===//


          state.last = hold & 0x01
          /*BITS(1)*/
          ; //--- DROPBITS(1) ---//

          hold >>>= 1;
          bits -= 1; //---//

          switch (hold & 0x03) {
            case 0:
              /* stored block */
              //Tracev((stderr, "inflate:     stored block%s\n",
              //        state.last ? " (last)" : ""));
              state.mode = STORED;
              break;

            case 1:
              /* fixed block */
              fixedtables(state); //Tracev((stderr, "inflate:     fixed codes block%s\n",
              //        state.last ? " (last)" : ""));

              state.mode = LEN_;
              /* decode codes */

              if (flush === Z_TREES) {
                //--- DROPBITS(2) ---//
                hold >>>= 2;
                bits -= 2; //---//

                break inf_leave;
              }

              break;

            case 2:
              /* dynamic block */
              //Tracev((stderr, "inflate:     dynamic codes block%s\n",
              //        state.last ? " (last)" : ""));
              state.mode = TABLE;
              break;

            case 3:
              strm.msg = 'invalid block type';
              state.mode = BAD;
          } //--- DROPBITS(2) ---//


          hold >>>= 2;
          bits -= 2; //---//

          break;

        case STORED:
          //--- BYTEBITS() ---// /* go to byte boundary */
          hold >>>= bits & 7;
          bits -= bits & 7; //---//
          //=== NEEDBITS(32); */

          while (bits < 32) {
            if (have === 0) {
              break inf_leave;
            }

            have--;
            hold += input[next++] << bits;
            bits += 8;
          } //===//


          if ((hold & 0xffff) !== (hold >>> 16 ^ 0xffff)) {
            strm.msg = 'invalid stored block lengths';
            state.mode = BAD;
            break;
          }

          state.length = hold & 0xffff; //Tracev((stderr, "inflate:       stored length %u\n",
          //        state.length));
          //=== INITBITS();

          hold = 0;
          bits = 0; //===//

          state.mode = COPY_;

          if (flush === Z_TREES) {
            break inf_leave;
          }

        /* falls through */

        case COPY_:
          state.mode = COPY;

        /* falls through */

        case COPY:
          copy = state.length;

          if (copy) {
            if (copy > have) {
              copy = have;
            }

            if (copy > left) {
              copy = left;
            }

            if (copy === 0) {
              break inf_leave;
            } //--- zmemcpy(put, next, copy); ---


            output.set(input.subarray(next, next + copy), put); //---//

            have -= copy;
            next += copy;
            left -= copy;
            put += copy;
            state.length -= copy;
            break;
          } //Tracev((stderr, "inflate:       stored end\n"));


          state.mode = TYPE;
          break;

        case TABLE:
          //=== NEEDBITS(14); */
          while (bits < 14) {
            if (have === 0) {
              break inf_leave;
            }

            have--;
            hold += input[next++] << bits;
            bits += 8;
          } //===//


          state.nlen = (hold & 0x1f) + 257; //--- DROPBITS(5) ---//

          hold >>>= 5;
          bits -= 5; //---//

          state.ndist = (hold & 0x1f) + 1; //--- DROPBITS(5) ---//

          hold >>>= 5;
          bits -= 5; //---//

          state.ncode = (hold & 0x0f) + 4; //--- DROPBITS(4) ---//

          hold >>>= 4;
          bits -= 4; //---//
          //#ifndef PKZIP_BUG_WORKAROUND

          if (state.nlen > 286 || state.ndist > 30) {
            strm.msg = 'too many length or distance symbols';
            state.mode = BAD;
            break;
          } //#endif
          //Tracev((stderr, "inflate:       table sizes ok\n"));


          state.have = 0;
          state.mode = LENLENS;

        /* falls through */

        case LENLENS:
          while (state.have < state.ncode) {
            //=== NEEDBITS(3);
            while (bits < 3) {
              if (have === 0) {
                break inf_leave;
              }

              have--;
              hold += input[next++] << bits;
              bits += 8;
            } //===//


            state.lens[order[state.have++]] = hold & 0x07; //BITS(3);
            //--- DROPBITS(3) ---//

            hold >>>= 3;
            bits -= 3; //---//
          }

          while (state.have < 19) {
            state.lens[order[state.have++]] = 0;
          } // We have separate tables & no pointers. 2 commented lines below not needed.
          //state.next = state.codes;
          //state.lencode = state.next;
          // Switch to use dynamic table


          state.lencode = state.lendyn;
          state.lenbits = 7;
          opts = {
            bits: state.lenbits
          };
          ret = inftrees(CODES, state.lens, 0, 19, state.lencode, 0, state.work, opts);
          state.lenbits = opts.bits;

          if (ret) {
            strm.msg = 'invalid code lengths set';
            state.mode = BAD;
            break;
          } //Tracev((stderr, "inflate:       code lengths ok\n"));


          state.have = 0;
          state.mode = CODELENS;

        /* falls through */

        case CODELENS:
          while (state.have < state.nlen + state.ndist) {
            for (;;) {
              here = state.lencode[hold & (1 << state.lenbits) - 1];
              /*BITS(state.lenbits)*/

              here_bits = here >>> 24;
              here_op = here >>> 16 & 0xff;
              here_val = here & 0xffff;

              if (here_bits <= bits) {
                break;
              } //--- PULLBYTE() ---//


              if (have === 0) {
                break inf_leave;
              }

              have--;
              hold += input[next++] << bits;
              bits += 8; //---//
            }

            if (here_val < 16) {
              //--- DROPBITS(here.bits) ---//
              hold >>>= here_bits;
              bits -= here_bits; //---//

              state.lens[state.have++] = here_val;
            } else {
              if (here_val === 16) {
                //=== NEEDBITS(here.bits + 2);
                n = here_bits + 2;

                while (bits < n) {
                  if (have === 0) {
                    break inf_leave;
                  }

                  have--;
                  hold += input[next++] << bits;
                  bits += 8;
                } //===//
                //--- DROPBITS(here.bits) ---//


                hold >>>= here_bits;
                bits -= here_bits; //---//

                if (state.have === 0) {
                  strm.msg = 'invalid bit length repeat';
                  state.mode = BAD;
                  break;
                }

                len = state.lens[state.have - 1];
                copy = 3 + (hold & 0x03); //BITS(2);
                //--- DROPBITS(2) ---//

                hold >>>= 2;
                bits -= 2; //---//
              } else if (here_val === 17) {
                //=== NEEDBITS(here.bits + 3);
                n = here_bits + 3;

                while (bits < n) {
                  if (have === 0) {
                    break inf_leave;
                  }

                  have--;
                  hold += input[next++] << bits;
                  bits += 8;
                } //===//
                //--- DROPBITS(here.bits) ---//


                hold >>>= here_bits;
                bits -= here_bits; //---//

                len = 0;
                copy = 3 + (hold & 0x07); //BITS(3);
                //--- DROPBITS(3) ---//

                hold >>>= 3;
                bits -= 3; //---//
              } else {
                //=== NEEDBITS(here.bits + 7);
                n = here_bits + 7;

                while (bits < n) {
                  if (have === 0) {
                    break inf_leave;
                  }

                  have--;
                  hold += input[next++] << bits;
                  bits += 8;
                } //===//
                //--- DROPBITS(here.bits) ---//


                hold >>>= here_bits;
                bits -= here_bits; //---//

                len = 0;
                copy = 11 + (hold & 0x7f); //BITS(7);
                //--- DROPBITS(7) ---//

                hold >>>= 7;
                bits -= 7; //---//
              }

              if (state.have + copy > state.nlen + state.ndist) {
                strm.msg = 'invalid bit length repeat';
                state.mode = BAD;
                break;
              }

              while (copy--) {
                state.lens[state.have++] = len;
              }
            }
          }
          /* handle error breaks in while */


          if (state.mode === BAD) {
            break;
          }
          /* check for end-of-block code (better have one) */


          if (state.lens[256] === 0) {
            strm.msg = 'invalid code -- missing end-of-block';
            state.mode = BAD;
            break;
          }
          /* build code tables -- note: do not change the lenbits or distbits
             values here (9 and 6) without reading the comments in inftrees.h
             concerning the ENOUGH constants, which depend on those values */


          state.lenbits = 9;
          opts = {
            bits: state.lenbits
          };
          ret = inftrees(LENS, state.lens, 0, state.nlen, state.lencode, 0, state.work, opts); // We have separate tables & no pointers. 2 commented lines below not needed.
          // state.next_index = opts.table_index;

          state.lenbits = opts.bits; // state.lencode = state.next;

          if (ret) {
            strm.msg = 'invalid literal/lengths set';
            state.mode = BAD;
            break;
          }

          state.distbits = 6; //state.distcode.copy(state.codes);
          // Switch to use dynamic table

          state.distcode = state.distdyn;
          opts = {
            bits: state.distbits
          };
          ret = inftrees(DISTS, state.lens, state.nlen, state.ndist, state.distcode, 0, state.work, opts); // We have separate tables & no pointers. 2 commented lines below not needed.
          // state.next_index = opts.table_index;

          state.distbits = opts.bits; // state.distcode = state.next;

          if (ret) {
            strm.msg = 'invalid distances set';
            state.mode = BAD;
            break;
          } //Tracev((stderr, 'inflate:       codes ok\n'));


          state.mode = LEN_;

          if (flush === Z_TREES) {
            break inf_leave;
          }

        /* falls through */

        case LEN_:
          state.mode = LEN;

        /* falls through */

        case LEN:
          if (have >= 6 && left >= 258) {
            //--- RESTORE() ---
            strm.next_out = put;
            strm.avail_out = left;
            strm.next_in = next;
            strm.avail_in = have;
            state.hold = hold;
            state.bits = bits; //---

            inffast(strm, _out); //--- LOAD() ---

            put = strm.next_out;
            output = strm.output;
            left = strm.avail_out;
            next = strm.next_in;
            input = strm.input;
            have = strm.avail_in;
            hold = state.hold;
            bits = state.bits; //---

            if (state.mode === TYPE) {
              state.back = -1;
            }

            break;
          }

          state.back = 0;

          for (;;) {
            here = state.lencode[hold & (1 << state.lenbits) - 1];
            /*BITS(state.lenbits)*/

            here_bits = here >>> 24;
            here_op = here >>> 16 & 0xff;
            here_val = here & 0xffff;

            if (here_bits <= bits) {
              break;
            } //--- PULLBYTE() ---//


            if (have === 0) {
              break inf_leave;
            }

            have--;
            hold += input[next++] << bits;
            bits += 8; //---//
          }

          if (here_op && (here_op & 0xf0) === 0) {
            last_bits = here_bits;
            last_op = here_op;
            last_val = here_val;

            for (;;) {
              here = state.lencode[last_val + ((hold & (1 << last_bits + last_op) - 1) >> last_bits)];
              here_bits = here >>> 24;
              here_op = here >>> 16 & 0xff;
              here_val = here & 0xffff;

              if (last_bits + here_bits <= bits) {
                break;
              } //--- PULLBYTE() ---//


              if (have === 0) {
                break inf_leave;
              }

              have--;
              hold += input[next++] << bits;
              bits += 8; //---//
            } //--- DROPBITS(last.bits) ---//


            hold >>>= last_bits;
            bits -= last_bits; //---//

            state.back += last_bits;
          } //--- DROPBITS(here.bits) ---//


          hold >>>= here_bits;
          bits -= here_bits; //---//

          state.back += here_bits;
          state.length = here_val;

          if (here_op === 0) {
            //Tracevv((stderr, here.val >= 0x20 && here.val < 0x7f ?
            //        "inflate:         literal '%c'\n" :
            //        "inflate:         literal 0x%02x\n", here.val));
            state.mode = LIT;
            break;
          }

          if (here_op & 32) {
            //Tracevv((stderr, "inflate:         end of block\n"));
            state.back = -1;
            state.mode = TYPE;
            break;
          }

          if (here_op & 64) {
            strm.msg = 'invalid literal/length code';
            state.mode = BAD;
            break;
          }

          state.extra = here_op & 15;
          state.mode = LENEXT;

        /* falls through */

        case LENEXT:
          if (state.extra) {
            //=== NEEDBITS(state.extra);
            n = state.extra;

            while (bits < n) {
              if (have === 0) {
                break inf_leave;
              }

              have--;
              hold += input[next++] << bits;
              bits += 8;
            } //===//


            state.length += hold & (1 << state.extra) - 1
            /*BITS(state.extra)*/
            ; //--- DROPBITS(state.extra) ---//

            hold >>>= state.extra;
            bits -= state.extra; //---//

            state.back += state.extra;
          } //Tracevv((stderr, "inflate:         length %u\n", state.length));


          state.was = state.length;
          state.mode = DIST;

        /* falls through */

        case DIST:
          for (;;) {
            here = state.distcode[hold & (1 << state.distbits) - 1];
            /*BITS(state.distbits)*/

            here_bits = here >>> 24;
            here_op = here >>> 16 & 0xff;
            here_val = here & 0xffff;

            if (here_bits <= bits) {
              break;
            } //--- PULLBYTE() ---//


            if (have === 0) {
              break inf_leave;
            }

            have--;
            hold += input[next++] << bits;
            bits += 8; //---//
          }

          if ((here_op & 0xf0) === 0) {
            last_bits = here_bits;
            last_op = here_op;
            last_val = here_val;

            for (;;) {
              here = state.distcode[last_val + ((hold & (1 << last_bits + last_op) - 1) >> last_bits)];
              here_bits = here >>> 24;
              here_op = here >>> 16 & 0xff;
              here_val = here & 0xffff;

              if (last_bits + here_bits <= bits) {
                break;
              } //--- PULLBYTE() ---//


              if (have === 0) {
                break inf_leave;
              }

              have--;
              hold += input[next++] << bits;
              bits += 8; //---//
            } //--- DROPBITS(last.bits) ---//


            hold >>>= last_bits;
            bits -= last_bits; //---//

            state.back += last_bits;
          } //--- DROPBITS(here.bits) ---//


          hold >>>= here_bits;
          bits -= here_bits; //---//

          state.back += here_bits;

          if (here_op & 64) {
            strm.msg = 'invalid distance code';
            state.mode = BAD;
            break;
          }

          state.offset = here_val;
          state.extra = here_op & 15;
          state.mode = DISTEXT;

        /* falls through */

        case DISTEXT:
          if (state.extra) {
            //=== NEEDBITS(state.extra);
            n = state.extra;

            while (bits < n) {
              if (have === 0) {
                break inf_leave;
              }

              have--;
              hold += input[next++] << bits;
              bits += 8;
            } //===//


            state.offset += hold & (1 << state.extra) - 1
            /*BITS(state.extra)*/
            ; //--- DROPBITS(state.extra) ---//

            hold >>>= state.extra;
            bits -= state.extra; //---//

            state.back += state.extra;
          } //#ifdef INFLATE_STRICT


          if (state.offset > state.dmax) {
            strm.msg = 'invalid distance too far back';
            state.mode = BAD;
            break;
          } //#endif
          //Tracevv((stderr, "inflate:         distance %u\n", state.offset));


          state.mode = MATCH;

        /* falls through */

        case MATCH:
          if (left === 0) {
            break inf_leave;
          }

          copy = _out - left;

          if (state.offset > copy) {
            /* copy from window */
            copy = state.offset - copy;

            if (copy > state.whave) {
              if (state.sane) {
                strm.msg = 'invalid distance too far back';
                state.mode = BAD;
                break;
              } // (!) This block is disabled in zlib defaults,
              // don't enable it for binary compatibility
              //#ifdef INFLATE_ALLOW_INVALID_DISTANCE_TOOFAR_ARRR
              //          Trace((stderr, "inflate.c too far\n"));
              //          copy -= state.whave;
              //          if (copy > state.length) { copy = state.length; }
              //          if (copy > left) { copy = left; }
              //          left -= copy;
              //          state.length -= copy;
              //          do {
              //            output[put++] = 0;
              //          } while (--copy);
              //          if (state.length === 0) { state.mode = LEN; }
              //          break;
              //#endif

            }

            if (copy > state.wnext) {
              copy -= state.wnext;
              from = state.wsize - copy;
            } else {
              from = state.wnext - copy;
            }

            if (copy > state.length) {
              copy = state.length;
            }

            from_source = state.window;
          } else {
            /* copy from output */
            from_source = output;
            from = put - state.offset;
            copy = state.length;
          }

          if (copy > left) {
            copy = left;
          }

          left -= copy;
          state.length -= copy;

          do {
            output[put++] = from_source[from++];
          } while (--copy);

          if (state.length === 0) {
            state.mode = LEN;
          }

          break;

        case LIT:
          if (left === 0) {
            break inf_leave;
          }

          output[put++] = state.length;
          left--;
          state.mode = LEN;
          break;

        case CHECK:
          if (state.wrap) {
            //=== NEEDBITS(32);
            while (bits < 32) {
              if (have === 0) {
                break inf_leave;
              }

              have--; // Use '|' instead of '+' to make sure that result is signed

              hold |= input[next++] << bits;
              bits += 8;
            } //===//


            _out -= left;
            strm.total_out += _out;
            state.total += _out;

            if (_out) {
              strm.adler = state.check = state.flags ? crc32_1(state.check, output, _out, put - _out) : adler32_1(state.check, output, _out, put - _out);
            }

            _out = left; // NB: crc32 stored as signed 32-bit int, zswap32 returns signed too

            if ((state.flags ? hold : zswap32(hold)) !== state.check) {
              strm.msg = 'incorrect data check';
              state.mode = BAD;
              break;
            } //=== INITBITS();


            hold = 0;
            bits = 0; //===//
            //Tracev((stderr, "inflate:   check matches trailer\n"));
          }

          state.mode = LENGTH;

        /* falls through */

        case LENGTH:
          if (state.wrap && state.flags) {
            //=== NEEDBITS(32);
            while (bits < 32) {
              if (have === 0) {
                break inf_leave;
              }

              have--;
              hold += input[next++] << bits;
              bits += 8;
            } //===//


            if (hold !== (state.total & 0xffffffff)) {
              strm.msg = 'incorrect length check';
              state.mode = BAD;
              break;
            } //=== INITBITS();


            hold = 0;
            bits = 0; //===//
            //Tracev((stderr, "inflate:   length matches trailer\n"));
          }

          state.mode = DONE;

        /* falls through */

        case DONE:
          ret = Z_STREAM_END$1;
          break inf_leave;

        case BAD:
          ret = Z_DATA_ERROR$1;
          break inf_leave;

        case MEM:
          return Z_MEM_ERROR$1;

        case SYNC:
        /* falls through */

        default:
          return Z_STREAM_ERROR$1;
      }
    } // inf_leave <- here is real place for "goto inf_leave", emulated via "break inf_leave"

    /*
       Return from inflate(), updating the total counts and the check value.
       If there was no progress during the inflate() call, return a buffer
       error.  Call updatewindow() to create and/or update the window state.
       Note: a memory error from inflate() is non-recoverable.
     */
    //--- RESTORE() ---


    strm.next_out = put;
    strm.avail_out = left;
    strm.next_in = next;
    strm.avail_in = have;
    state.hold = hold;
    state.bits = bits; //---

    if (state.wsize || _out !== strm.avail_out && state.mode < BAD && (state.mode < CHECK || flush !== Z_FINISH$1)) {
      if (updatewindow(strm, strm.output, strm.next_out, _out - strm.avail_out)) ;
    }

    _in -= strm.avail_in;
    _out -= strm.avail_out;
    strm.total_in += _in;
    strm.total_out += _out;
    state.total += _out;

    if (state.wrap && _out) {
      strm.adler = state.check = state.flags ? crc32_1(state.check, output, _out, strm.next_out - _out) : adler32_1(state.check, output, _out, strm.next_out - _out);
    }

    strm.data_type = state.bits + (state.last ? 64 : 0) + (state.mode === TYPE ? 128 : 0) + (state.mode === LEN_ || state.mode === COPY_ ? 256 : 0);

    if ((_in === 0 && _out === 0 || flush === Z_FINISH$1) && ret === Z_OK$1) {
      ret = Z_BUF_ERROR;
    }

    return ret;
  };

  var inflateEnd = function inflateEnd(strm) {
    if (!strm || !strm.state
    /*|| strm->zfree == (free_func)0*/
    ) {
      return Z_STREAM_ERROR$1;
    }

    var state = strm.state;

    if (state.window) {
      state.window = null;
    }

    strm.state = null;
    return Z_OK$1;
  };

  var inflateGetHeader = function inflateGetHeader(strm, head) {
    /* check state */
    if (!strm || !strm.state) {
      return Z_STREAM_ERROR$1;
    }

    var state = strm.state;

    if ((state.wrap & 2) === 0) {
      return Z_STREAM_ERROR$1;
    }
    /* save header structure */


    state.head = head;
    head.done = false;
    return Z_OK$1;
  };

  var inflateSetDictionary = function inflateSetDictionary(strm, dictionary) {
    var dictLength = dictionary.length;
    var state;
    var dictid;
    var ret;
    /* check state */

    if (!strm
    /* == Z_NULL */
    || !strm.state
    /* == Z_NULL */
    ) {
      return Z_STREAM_ERROR$1;
    }

    state = strm.state;

    if (state.wrap !== 0 && state.mode !== DICT) {
      return Z_STREAM_ERROR$1;
    }
    /* check for correct dictionary identifier */


    if (state.mode === DICT) {
      dictid = 1;
      /* adler32(0, null, 0)*/

      /* dictid = adler32(dictid, dictionary, dictLength); */

      dictid = adler32_1(dictid, dictionary, dictLength, 0);

      if (dictid !== state.check) {
        return Z_DATA_ERROR$1;
      }
    }
    /* copy dictionary to window using updatewindow(), which will amend the
     existing dictionary if appropriate */


    ret = updatewindow(strm, dictionary, dictLength, dictLength);

    if (ret) {
      state.mode = MEM;
      return Z_MEM_ERROR$1;
    }

    state.havedict = 1; // Tracev((stderr, "inflate:   dictionary set\n"));

    return Z_OK$1;
  };

  var inflateReset_1 = inflateReset;
  var inflateReset2_1 = inflateReset2;
  var inflateResetKeep_1 = inflateResetKeep;
  var inflateInit_1 = inflateInit;
  var inflateInit2_1 = inflateInit2;
  var inflate_2$1 = inflate$2;
  var inflateEnd_1 = inflateEnd;
  var inflateGetHeader_1 = inflateGetHeader;
  var inflateSetDictionary_1 = inflateSetDictionary;
  var inflateInfo = 'pako inflate (from Nodeca project)';
  /* Not implemented
  module.exports.inflateCopy = inflateCopy;
  module.exports.inflateGetDictionary = inflateGetDictionary;
  module.exports.inflateMark = inflateMark;
  module.exports.inflatePrime = inflatePrime;
  module.exports.inflateSync = inflateSync;
  module.exports.inflateSyncPoint = inflateSyncPoint;
  module.exports.inflateUndermine = inflateUndermine;
  */

  var inflate_1$2 = {
    inflateReset: inflateReset_1,
    inflateReset2: inflateReset2_1,
    inflateResetKeep: inflateResetKeep_1,
    inflateInit: inflateInit_1,
    inflateInit2: inflateInit2_1,
    inflate: inflate_2$1,
    inflateEnd: inflateEnd_1,
    inflateGetHeader: inflateGetHeader_1,
    inflateSetDictionary: inflateSetDictionary_1,
    inflateInfo: inflateInfo
  };

  // (C) 2014-2017 Vitaly Puzrin and Andrey Tupitsin
  //
  // This software is provided 'as-is', without any express or implied
  // warranty. In no event will the authors be held liable for any damages
  // arising from the use of this software.
  //
  // Permission is granted to anyone to use this software for any purpose,
  // including commercial applications, and to alter it and redistribute it
  // freely, subject to the following restrictions:
  //
  // 1. The origin of this software must not be misrepresented; you must not
  //   claim that you wrote the original software. If you use this software
  //   in a product, an acknowledgment in the product documentation would be
  //   appreciated but is not required.
  // 2. Altered source versions must be plainly marked as such, and must not be
  //   misrepresented as being the original software.
  // 3. This notice may not be removed or altered from any source distribution.

  function GZheader() {
    /* true if compressed data believed to be text */
    this.text = 0;
    /* modification time */

    this.time = 0;
    /* extra flags (not used when writing a gzip file) */

    this.xflags = 0;
    /* operating system */

    this.os = 0;
    /* pointer to extra field or Z_NULL if none */

    this.extra = null;
    /* extra field length (valid if extra != Z_NULL) */

    this.extra_len = 0; // Actually, we don't need it in JS,
    // but leave for few code modifications
    //
    // Setup limits is not necessary because in js we should not preallocate memory
    // for inflate use constant limit in 65536 bytes
    //

    /* space at extra (only when reading header) */
    // this.extra_max  = 0;

    /* pointer to zero-terminated file name or Z_NULL */

    this.name = '';
    /* space at name (only when reading header) */
    // this.name_max   = 0;

    /* pointer to zero-terminated comment or Z_NULL */

    this.comment = '';
    /* space at comment (only when reading header) */
    // this.comm_max   = 0;

    /* true if there was or will be a header crc */

    this.hcrc = 0;
    /* true when done reading gzip header (not used when writing a gzip file) */

    this.done = false;
  }

  var gzheader = GZheader;

  var toString = Object.prototype.toString;
  /* Public constants ==========================================================*/

  /* ===========================================================================*/

  var Z_NO_FLUSH = constants$2.Z_NO_FLUSH,
      Z_FINISH = constants$2.Z_FINISH,
      Z_OK = constants$2.Z_OK,
      Z_STREAM_END = constants$2.Z_STREAM_END,
      Z_NEED_DICT = constants$2.Z_NEED_DICT,
      Z_STREAM_ERROR = constants$2.Z_STREAM_ERROR,
      Z_DATA_ERROR = constants$2.Z_DATA_ERROR,
      Z_MEM_ERROR = constants$2.Z_MEM_ERROR;
  /* ===========================================================================*/

  /**
   * class Inflate
   *
   * Generic JS-style wrapper for zlib calls. If you don't need
   * streaming behaviour - use more simple functions: [[inflate]]
   * and [[inflateRaw]].
   **/

  /* internal
   * inflate.chunks -> Array
   *
   * Chunks of output data, if [[Inflate#onData]] not overridden.
   **/

  /**
   * Inflate.result -> Uint8Array|String
   *
   * Uncompressed result, generated by default [[Inflate#onData]]
   * and [[Inflate#onEnd]] handlers. Filled after you push last chunk
   * (call [[Inflate#push]] with `Z_FINISH` / `true` param).
   **/

  /**
   * Inflate.err -> Number
   *
   * Error code after inflate finished. 0 (Z_OK) on success.
   * Should be checked if broken data possible.
   **/

  /**
   * Inflate.msg -> String
   *
   * Error message, if [[Inflate.err]] != 0
   **/

  /**
   * new Inflate(options)
   * - options (Object): zlib inflate options.
   *
   * Creates new inflator instance with specified params. Throws exception
   * on bad params. Supported options:
   *
   * - `windowBits`
   * - `dictionary`
   *
   * [http://zlib.net/manual.html#Advanced](http://zlib.net/manual.html#Advanced)
   * for more information on these.
   *
   * Additional options, for internal needs:
   *
   * - `chunkSize` - size of generated data chunks (16K by default)
   * - `raw` (Boolean) - do raw inflate
   * - `to` (String) - if equal to 'string', then result will be converted
   *   from utf8 to utf16 (javascript) string. When string output requested,
   *   chunk length can differ from `chunkSize`, depending on content.
   *
   * By default, when no options set, autodetect deflate/gzip data format via
   * wrapper header.
   *
   * ##### Example:
   *
   * ```javascript
   * const pako = require('pako')
   * const chunk1 = new Uint8Array([1,2,3,4,5,6,7,8,9])
   * const chunk2 = new Uint8Array([10,11,12,13,14,15,16,17,18,19]);
   *
   * const inflate = new pako.Inflate({ level: 3});
   *
   * inflate.push(chunk1, false);
   * inflate.push(chunk2, true);  // true -> last chunk
   *
   * if (inflate.err) { throw new Error(inflate.err); }
   *
   * console.log(inflate.result);
   * ```
   **/

  function Inflate$1(options) {
    this.options = common.assign({
      chunkSize: 1024 * 64,
      windowBits: 15,
      to: ''
    }, options || {});
    var opt = this.options; // Force window size for `raw` data, if not set directly,
    // because we have no header for autodetect.

    if (opt.raw && opt.windowBits >= 0 && opt.windowBits < 16) {
      opt.windowBits = -opt.windowBits;

      if (opt.windowBits === 0) {
        opt.windowBits = -15;
      }
    } // If `windowBits` not defined (and mode not raw) - set autodetect flag for gzip/deflate


    if (opt.windowBits >= 0 && opt.windowBits < 16 && !(options && options.windowBits)) {
      opt.windowBits += 32;
    } // Gzip header has no info about windows size, we can do autodetect only
    // for deflate. So, if window size not set, force it to max when gzip possible


    if (opt.windowBits > 15 && opt.windowBits < 48) {
      // bit 3 (16) -> gzipped data
      // bit 4 (32) -> autodetect gzip/deflate
      if ((opt.windowBits & 15) === 0) {
        opt.windowBits |= 15;
      }
    }

    this.err = 0; // error code, if happens (0 = Z_OK)

    this.msg = ''; // error message

    this.ended = false; // used to avoid multiple onEnd() calls

    this.chunks = []; // chunks of compressed data

    this.strm = new zstream();
    this.strm.avail_out = 0;
    var status = inflate_1$2.inflateInit2(this.strm, opt.windowBits);

    if (status !== Z_OK) {
      throw new Error(messages[status]);
    }

    this.header = new gzheader();
    inflate_1$2.inflateGetHeader(this.strm, this.header); // Setup dictionary

    if (opt.dictionary) {
      // Convert data if needed
      if (typeof opt.dictionary === 'string') {
        opt.dictionary = strings.string2buf(opt.dictionary);
      } else if (toString.call(opt.dictionary) === '[object ArrayBuffer]') {
        opt.dictionary = new Uint8Array(opt.dictionary);
      }

      if (opt.raw) {
        //In raw mode we need to set the dictionary early
        status = inflate_1$2.inflateSetDictionary(this.strm, opt.dictionary);

        if (status !== Z_OK) {
          throw new Error(messages[status]);
        }
      }
    }
  }
  /**
   * Inflate#push(data[, flush_mode]) -> Boolean
   * - data (Uint8Array|ArrayBuffer): input data
   * - flush_mode (Number|Boolean): 0..6 for corresponding Z_NO_FLUSH..Z_TREE
   *   flush modes. See constants. Skipped or `false` means Z_NO_FLUSH,
   *   `true` means Z_FINISH.
   *
   * Sends input data to inflate pipe, generating [[Inflate#onData]] calls with
   * new output chunks. Returns `true` on success. If end of stream detected,
   * [[Inflate#onEnd]] will be called.
   *
   * `flush_mode` is not needed for normal operation, because end of stream
   * detected automatically. You may try to use it for advanced things, but
   * this functionality was not tested.
   *
   * On fail call [[Inflate#onEnd]] with error code and return false.
   *
   * ##### Example
   *
   * ```javascript
   * push(chunk, false); // push one of data chunks
   * ...
   * push(chunk, true);  // push last chunk
   * ```
   **/


  Inflate$1.prototype.push = function (data, flush_mode) {
    var strm = this.strm;
    var chunkSize = this.options.chunkSize;
    var dictionary = this.options.dictionary;

    var status, _flush_mode, last_avail_out;

    if (this.ended) return false;
    if (flush_mode === ~~flush_mode) _flush_mode = flush_mode;else _flush_mode = flush_mode === true ? Z_FINISH : Z_NO_FLUSH; // Convert data if needed

    if (toString.call(data) === '[object ArrayBuffer]') {
      strm.input = new Uint8Array(data);
    } else {
      strm.input = data;
    }

    strm.next_in = 0;
    strm.avail_in = strm.input.length;

    for (;;) {
      if (strm.avail_out === 0) {
        strm.output = new Uint8Array(chunkSize);
        strm.next_out = 0;
        strm.avail_out = chunkSize;
      }

      status = inflate_1$2.inflate(strm, _flush_mode);

      if (status === Z_NEED_DICT && dictionary) {
        status = inflate_1$2.inflateSetDictionary(strm, dictionary);

        if (status === Z_OK) {
          status = inflate_1$2.inflate(strm, _flush_mode);
        } else if (status === Z_DATA_ERROR) {
          // Replace code with more verbose
          status = Z_NEED_DICT;
        }
      } // Skip snyc markers if more data follows and not raw mode


      while (strm.avail_in > 0 && status === Z_STREAM_END && strm.state.wrap > 0 && data[strm.next_in] !== 0) {
        inflate_1$2.inflateReset(strm);
        status = inflate_1$2.inflate(strm, _flush_mode);
      }

      switch (status) {
        case Z_STREAM_ERROR:
        case Z_DATA_ERROR:
        case Z_NEED_DICT:
        case Z_MEM_ERROR:
          this.onEnd(status);
          this.ended = true;
          return false;
      } // Remember real `avail_out` value, because we may patch out buffer content
      // to align utf8 strings boundaries.


      last_avail_out = strm.avail_out;

      if (strm.next_out) {
        if (strm.avail_out === 0 || status === Z_STREAM_END) {
          if (this.options.to === 'string') {
            var next_out_utf8 = strings.utf8border(strm.output, strm.next_out);
            var tail = strm.next_out - next_out_utf8;
            var utf8str = strings.buf2string(strm.output, next_out_utf8); // move tail & realign counters

            strm.next_out = tail;
            strm.avail_out = chunkSize - tail;
            if (tail) strm.output.set(strm.output.subarray(next_out_utf8, next_out_utf8 + tail), 0);
            this.onData(utf8str);
          } else {
            this.onData(strm.output.length === strm.next_out ? strm.output : strm.output.subarray(0, strm.next_out));
          }
        }
      } // Must repeat iteration if out buffer is full


      if (status === Z_OK && last_avail_out === 0) continue; // Finalize if end of stream reached.

      if (status === Z_STREAM_END) {
        status = inflate_1$2.inflateEnd(this.strm);
        this.onEnd(status);
        this.ended = true;
        return true;
      }

      if (strm.avail_in === 0) break;
    }

    return true;
  };
  /**
   * Inflate#onData(chunk) -> Void
   * - chunk (Uint8Array|String): output data. When string output requested,
   *   each chunk will be string.
   *
   * By default, stores data blocks in `chunks[]` property and glue
   * those in `onEnd`. Override this handler, if you need another behaviour.
   **/


  Inflate$1.prototype.onData = function (chunk) {
    this.chunks.push(chunk);
  };
  /**
   * Inflate#onEnd(status) -> Void
   * - status (Number): inflate status. 0 (Z_OK) on success,
   *   other if not.
   *
   * Called either after you tell inflate that the input stream is
   * complete (Z_FINISH). By default - join collected chunks,
   * free memory and fill `results` / `err` properties.
   **/


  Inflate$1.prototype.onEnd = function (status) {
    // On success - join
    if (status === Z_OK) {
      if (this.options.to === 'string') {
        this.result = this.chunks.join('');
      } else {
        this.result = common.flattenChunks(this.chunks);
      }
    }

    this.chunks = [];
    this.err = status;
    this.msg = this.strm.msg;
  };
  /**
   * inflate(data[, options]) -> Uint8Array|String
   * - data (Uint8Array): input data to decompress.
   * - options (Object): zlib inflate options.
   *
   * Decompress `data` with inflate/ungzip and `options`. Autodetect
   * format via wrapper header by default. That's why we don't provide
   * separate `ungzip` method.
   *
   * Supported options are:
   *
   * - windowBits
   *
   * [http://zlib.net/manual.html#Advanced](http://zlib.net/manual.html#Advanced)
   * for more information.
   *
   * Sugar (options):
   *
   * - `raw` (Boolean) - say that we work with raw stream, if you don't wish to specify
   *   negative windowBits implicitly.
   * - `to` (String) - if equal to 'string', then result will be converted
   *   from utf8 to utf16 (javascript) string. When string output requested,
   *   chunk length can differ from `chunkSize`, depending on content.
   *
   *
   * ##### Example:
   *
   * ```javascript
   * const pako = require('pako');
   * const input = pako.deflate(new Uint8Array([1,2,3,4,5,6,7,8,9]));
   * let output;
   *
   * try {
   *   output = pako.inflate(input);
   * } catch (err) {
   *   console.log(err);
   * }
   * ```
   **/


  function inflate$1(input, options) {
    var inflator = new Inflate$1(options);
    inflator.push(input); // That will never happens, if you don't cheat with options :)

    if (inflator.err) throw inflator.msg || messages[inflator.err];
    return inflator.result;
  }
  /**
   * inflateRaw(data[, options]) -> Uint8Array|String
   * - data (Uint8Array): input data to decompress.
   * - options (Object): zlib inflate options.
   *
   * The same as [[inflate]], but creates raw data, without wrapper
   * (header and adler32 crc).
   **/


  function inflateRaw$1(input, options) {
    options = options || {};
    options.raw = true;
    return inflate$1(input, options);
  }
  /**
   * ungzip(data[, options]) -> Uint8Array|String
   * - data (Uint8Array): input data to decompress.
   * - options (Object): zlib inflate options.
   *
   * Just shortcut to [[inflate]], because it autodetects format
   * by header.content. Done for convenience.
   **/


  var Inflate_1$1 = Inflate$1;
  var inflate_2 = inflate$1;
  var inflateRaw_1$1 = inflateRaw$1;
  var ungzip$1 = inflate$1;
  var constants = constants$2;
  var inflate_1$1 = {
    Inflate: Inflate_1$1,
    inflate: inflate_2,
    inflateRaw: inflateRaw_1$1,
    ungzip: ungzip$1,
    constants: constants
  };

  var Deflate = deflate_1$1.Deflate,
      deflate = deflate_1$1.deflate,
      deflateRaw = deflate_1$1.deflateRaw,
      gzip = deflate_1$1.gzip;
  var Inflate = inflate_1$1.Inflate,
      inflate = inflate_1$1.inflate,
      inflateRaw = inflate_1$1.inflateRaw,
      ungzip = inflate_1$1.ungzip;
  var Deflate_1 = Deflate;
  var deflate_1 = deflate;
  var deflateRaw_1 = deflateRaw;
  var gzip_1 = gzip;
  var Inflate_1 = Inflate;
  var inflate_1 = inflate;
  var inflateRaw_1 = inflateRaw;
  var ungzip_1 = ungzip;
  var constants_1 = constants$2;
  var pako = {
    Deflate: Deflate_1,
    deflate: deflate_1,
    deflateRaw: deflateRaw_1,
    gzip: gzip_1,
    Inflate: Inflate_1,
    inflate: inflate_1,
    inflateRaw: inflateRaw_1,
    ungzip: ungzip_1,
    constants: constants_1
  };

  exports.Deflate = Deflate_1;
  exports.Inflate = Inflate_1;
  exports.constants = constants_1;
  exports['default'] = pako;
  exports.deflate = deflate_1;
  exports.deflateRaw = deflateRaw_1;
  exports.gzip = gzip_1;
  exports.inflate = inflate_1;
  exports.inflateRaw = inflateRaw_1;
  exports.ungzip = ungzip_1;

  Object.defineProperty(exports, '__esModule', { value: true });

})));
/*globals window, global, require*/

/**
 * CryptoJS core components.
 */
var CryptoJS = CryptoJS || (function (Math, undefined) {

    var crypto;

    // Native crypto from window (Browser)
    if (typeof window !== 'undefined' && window.crypto) {
        crypto = window.crypto;
    }

    // Native crypto in web worker (Browser)
    if (typeof self !== 'undefined' && self.crypto) {
        crypto = self.crypto;
    }

    // Native crypto from worker
    if (typeof globalThis !== 'undefined' && globalThis.crypto) {
        crypto = globalThis.crypto;
    }

    // Native (experimental IE 11) crypto from window (Browser)
    if (!crypto && typeof window !== 'undefined' && window.msCrypto) {
        crypto = window.msCrypto;
    }

    // Native crypto from global (NodeJS)
    if (!crypto && typeof global !== 'undefined' && global.crypto) {
        crypto = global.crypto;
    }

    // Native crypto import via require (NodeJS)
    if (!crypto && typeof require === 'function') {
        try {
            crypto = require('crypto');
        } catch (err) {}
    }

    /*
     * Cryptographically secure pseudorandom number generator
     *
     * As Math.random() is cryptographically not safe to use
     */
    var cryptoSecureRandomInt = function () {
        if (crypto) {
            // Use getRandomValues method (Browser)
            if (typeof crypto.getRandomValues === 'function') {
                try {
                    return crypto.getRandomValues(new Uint32Array(1))[0];
                } catch (err) {}
            }

            // Use randomBytes method (NodeJS)
            if (typeof crypto.randomBytes === 'function') {
                try {
                    return crypto.randomBytes(4).readInt32LE();
                } catch (err) {}
            }
        }

        throw new Error('Native crypto module could not be used to get secure random number.');
    };

    /*
     * Local polyfill of Object.create

     */
    var create = Object.create || (function () {
        function F() {}

        return function (obj) {
            var subtype;

            F.prototype = obj;

            subtype = new F();

            F.prototype = null;

            return subtype;
        };
    }());

    /**
     * CryptoJS namespace.
     */
    var C = {};

    /**
     * Library namespace.
     */
    var C_lib = C.lib = {};

    /**
     * Base object for prototypal inheritance.
     */
    var Base = C_lib.Base = (function () {


        return {
            /**
             * Creates a new object that inherits from this object.
             *
             * @param {Object} overrides Properties to copy into the new object.
             *
             * @return {Object} The new object.
             *
             * @static
             *
             * @example
             *
             *     var MyType = CryptoJS.lib.Base.extend({
             *         field: 'value',
             *
             *         method: function () {
             *         }
             *     });
             */
            extend: function (overrides) {
                // Spawn
                var subtype = create(this);

                // Augment
                if (overrides) {
                    subtype.mixIn(overrides);
                }

                // Create default initializer
                if (!subtype.hasOwnProperty('init') || this.init === subtype.init) {
                    subtype.init = function () {
                        subtype.$super.init.apply(this, arguments);
                    };
                }

                // Initializer's prototype is the subtype object
                subtype.init.prototype = subtype;

                // Reference supertype
                subtype.$super = this;

                return subtype;
            },

            /**
             * Extends this object and runs the init method.
             * Arguments to create() will be passed to init().
             *
             * @return {Object} The new object.
             *
             * @static
             *
             * @example
             *
             *     var instance = MyType.create();
             */
            create: function () {
                var instance = this.extend();
                instance.init.apply(instance, arguments);

                return instance;
            },

            /**
             * Initializes a newly created object.
             * Override this method to add some logic when your objects are created.
             *
             * @example
             *
             *     var MyType = CryptoJS.lib.Base.extend({
             *         init: function () {
             *             // ...
             *         }
             *     });
             */
            init: function () {
            },

            /**
             * Copies properties into this object.
             *
             * @param {Object} properties The properties to mix in.
             *
             * @example
             *
             *     MyType.mixIn({
             *         field: 'value'
             *     });
             */
            mixIn: function (properties) {
                for (var propertyName in properties) {
                    if (properties.hasOwnProperty(propertyName)) {
                        this[propertyName] = properties[propertyName];
                    }
                }

                // IE won't copy toString using the loop above
                if (properties.hasOwnProperty('toString')) {
                    this.toString = properties.toString;
                }
            },

            /**
             * Creates a copy of this object.
             *
             * @return {Object} The clone.
             *
             * @example
             *
             *     var clone = instance.clone();
             */
            clone: function () {
                return this.init.prototype.extend(this);
            }
        };
    }());

    /**
     * An array of 32-bit words.
     *
     * @property {Array} words The array of 32-bit words.
     * @property {number} sigBytes The number of significant bytes in this word array.
     */
    var WordArray = C_lib.WordArray = Base.extend({
        /**
         * Initializes a newly created word array.
         *
         * @param {Array} words (Optional) An array of 32-bit words.
         * @param {number} sigBytes (Optional) The number of significant bytes in the words.
         *
         * @example
         *
         *     var wordArray = CryptoJS.lib.WordArray.create();
         *     var wordArray = CryptoJS.lib.WordArray.create([0x00010203, 0x04050607]);
         *     var wordArray = CryptoJS.lib.WordArray.create([0x00010203, 0x04050607], 6);
         */
        init: function (words, sigBytes) {
            words = this.words = words || [];

            if (sigBytes != undefined) {
                this.sigBytes = sigBytes;
            } else {
                this.sigBytes = words.length * 4;
            }
        },

        /**
         * Converts this word array to a string.
         *
         * @param {Encoder} encoder (Optional) The encoding strategy to use. Default: CryptoJS.enc.Hex
         *
         * @return {string} The stringified word array.
         *
         * @example
         *
         *     var string = wordArray + '';
         *     var string = wordArray.toString();
         *     var string = wordArray.toString(CryptoJS.enc.Utf8);
         */
        toString: function (encoder) {
            return (encoder || Hex).stringify(this);
        },

        /**
         * Concatenates a word array to this word array.
         *
         * @param {WordArray} wordArray The word array to append.
         *
         * @return {WordArray} This word array.
         *
         * @example
         *
         *     wordArray1.concat(wordArray2);
         */
        concat: function (wordArray) {
            // Shortcuts
            var thisWords = this.words;
            var thatWords = wordArray.words;
            var thisSigBytes = this.sigBytes;
            var thatSigBytes = wordArray.sigBytes;

            // Clamp excess bits
            this.clamp();

            // Concat
            if (thisSigBytes % 4) {
                // Copy one byte at a time
                for (var i = 0; i < thatSigBytes; i++) {
                    var thatByte = (thatWords[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
                    thisWords[(thisSigBytes + i) >>> 2] |= thatByte << (24 - ((thisSigBytes + i) % 4) * 8);
                }
            } else {
                // Copy one word at a time
                for (var j = 0; j < thatSigBytes; j += 4) {
                    thisWords[(thisSigBytes + j) >>> 2] = thatWords[j >>> 2];
                }
            }
            this.sigBytes += thatSigBytes;

            // Chainable
            return this;
        },

        /**
         * Removes insignificant bits.
         *
         * @example
         *
         *     wordArray.clamp();
         */
        clamp: function () {
            // Shortcuts
            var words = this.words;
            var sigBytes = this.sigBytes;

            // Clamp
            words[sigBytes >>> 2] &= 0xffffffff << (32 - (sigBytes % 4) * 8);
            words.length = Math.ceil(sigBytes / 4);
        },

        /**
         * Creates a copy of this word array.
         *
         * @return {WordArray} The clone.
         *
         * @example
         *
         *     var clone = wordArray.clone();
         */
        clone: function () {
            var clone = Base.clone.call(this);
            clone.words = this.words.slice(0);

            return clone;
        },

        /**
         * Creates a word array filled with random bytes.
         *
         * @param {number} nBytes The number of random bytes to generate.
         *
         * @return {WordArray} The random word array.
         *
         * @static
         *
         * @example
         *
         *     var wordArray = CryptoJS.lib.WordArray.random(16);
         */
        random: function (nBytes) {
            var words = [];

            for (var i = 0; i < nBytes; i += 4) {
                words.push(cryptoSecureRandomInt());
            }

            return new WordArray.init(words, nBytes);
        }
    });

    /**
     * Encoder namespace.
     */
    var C_enc = C.enc = {};

    /**
     * Hex encoding strategy.
     */
    var Hex = C_enc.Hex = {
        /**
         * Converts a word array to a hex string.
         *
         * @param {WordArray} wordArray The word array.
         *
         * @return {string} The hex string.
         *
         * @static
         *
         * @example
         *
         *     var hexString = CryptoJS.enc.Hex.stringify(wordArray);
         */
        stringify: function (wordArray) {
            // Shortcuts
            var words = wordArray.words;
            var sigBytes = wordArray.sigBytes;

            // Convert
            var hexChars = [];
            for (var i = 0; i < sigBytes; i++) {
                var bite = (words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
                hexChars.push((bite >>> 4).toString(16));
                hexChars.push((bite & 0x0f).toString(16));
            }

            return hexChars.join('');
        },

        /**
         * Converts a hex string to a word array.
         *
         * @param {string} hexStr The hex string.
         *
         * @return {WordArray} The word array.
         *
         * @static
         *
         * @example
         *
         *     var wordArray = CryptoJS.enc.Hex.parse(hexString);
         */
        parse: function (hexStr) {
            // Shortcut
            var hexStrLength = hexStr.length;

            // Convert
            var words = [];
            for (var i = 0; i < hexStrLength; i += 2) {
                words[i >>> 3] |= parseInt(hexStr.substr(i, 2), 16) << (24 - (i % 8) * 4);
            }

            return new WordArray.init(words, hexStrLength / 2);
        }
    };

    /**
     * Latin1 encoding strategy.
     */
    var Latin1 = C_enc.Latin1 = {
        /**
         * Converts a word array to a Latin1 string.
         *
         * @param {WordArray} wordArray The word array.
         *
         * @return {string} The Latin1 string.
         *
         * @static
         *
         * @example
         *
         *     var latin1String = CryptoJS.enc.Latin1.stringify(wordArray);
         */
        stringify: function (wordArray) {
            // Shortcuts
            var words = wordArray.words;
            var sigBytes = wordArray.sigBytes;

            // Convert
            var latin1Chars = [];
            for (var i = 0; i < sigBytes; i++) {
                var bite = (words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
                latin1Chars.push(String.fromCharCode(bite));
            }

            return latin1Chars.join('');
        },

        /**
         * Converts a Latin1 string to a word array.
         *
         * @param {string} latin1Str The Latin1 string.
         *
         * @return {WordArray} The word array.
         *
         * @static
         *
         * @example
         *
         *     var wordArray = CryptoJS.enc.Latin1.parse(latin1String);
         */
        parse: function (latin1Str) {
            // Shortcut
            var latin1StrLength = latin1Str.length;

            // Convert
            var words = [];
            for (var i = 0; i < latin1StrLength; i++) {
                words[i >>> 2] |= (latin1Str.charCodeAt(i) & 0xff) << (24 - (i % 4) * 8);
            }

            return new WordArray.init(words, latin1StrLength);
        }
    };

    /**
     * UTF-8 encoding strategy.
     */
    var Utf8 = C_enc.Utf8 = {
        /**
         * Converts a word array to a UTF-8 string.
         *
         * @param {WordArray} wordArray The word array.
         *
         * @return {string} The UTF-8 string.
         *
         * @static
         *
         * @example
         *
         *     var utf8String = CryptoJS.enc.Utf8.stringify(wordArray);
         */
        stringify: function (wordArray) {
            try {
                return decodeURIComponent(escape(Latin1.stringify(wordArray)));
            } catch (e) {
                throw new Error('Malformed UTF-8 data');
            }
        },

        /**
         * Converts a UTF-8 string to a word array.
         *
         * @param {string} utf8Str The UTF-8 string.
         *
         * @return {WordArray} The word array.
         *
         * @static
         *
         * @example
         *
         *     var wordArray = CryptoJS.enc.Utf8.parse(utf8String);
         */
        parse: function (utf8Str) {
            return Latin1.parse(unescape(encodeURIComponent(utf8Str)));
        }
    };

    /**
     * Abstract buffered block algorithm template.
     *
     * The property blockSize must be implemented in a concrete subtype.
     *
     * @property {number} _minBufferSize The number of blocks that should be kept unprocessed in the buffer. Default: 0
     */
    var BufferedBlockAlgorithm = C_lib.BufferedBlockAlgorithm = Base.extend({
        /**
         * Resets this block algorithm's data buffer to its initial state.
         *
         * @example
         *
         *     bufferedBlockAlgorithm.reset();
         */
        reset: function () {
            // Initial values
            this._data = new WordArray.init();
            this._nDataBytes = 0;
        },

        /**
         * Adds new data to this block algorithm's buffer.
         *
         * @param {WordArray|string} data The data to append. Strings are converted to a WordArray using UTF-8.
         *
         * @example
         *
         *     bufferedBlockAlgorithm._append('data');
         *     bufferedBlockAlgorithm._append(wordArray);
         */
        _append: function (data) {
            // Convert string to WordArray, else assume WordArray already
            if (typeof data == 'string') {
                data = Utf8.parse(data);
            }

            // Append
            this._data.concat(data);
            this._nDataBytes += data.sigBytes;
        },

        /**
         * Processes available data blocks.
         *
         * This method invokes _doProcessBlock(offset), which must be implemented by a concrete subtype.
         *
         * @param {boolean} doFlush Whether all blocks and partial blocks should be processed.
         *
         * @return {WordArray} The processed data.
         *
         * @example
         *
         *     var processedData = bufferedBlockAlgorithm._process();
         *     var processedData = bufferedBlockAlgorithm._process(!!'flush');
         */
        _process: function (doFlush) {
            var processedWords;

            // Shortcuts
            var data = this._data;
            var dataWords = data.words;
            var dataSigBytes = data.sigBytes;
            var blockSize = this.blockSize;
            var blockSizeBytes = blockSize * 4;

            // Count blocks ready
            var nBlocksReady = dataSigBytes / blockSizeBytes;
            if (doFlush) {
                // Round up to include partial blocks
                nBlocksReady = Math.ceil(nBlocksReady);
            } else {
                // Round down to include only full blocks,
                // less the number of blocks that must remain in the buffer
                nBlocksReady = Math.max((nBlocksReady | 0) - this._minBufferSize, 0);
            }

            // Count words ready
            var nWordsReady = nBlocksReady * blockSize;

            // Count bytes ready
            var nBytesReady = Math.min(nWordsReady * 4, dataSigBytes);

            // Process blocks
            if (nWordsReady) {
                for (var offset = 0; offset < nWordsReady; offset += blockSize) {
                    // Perform concrete-algorithm logic
                    this._doProcessBlock(dataWords, offset);
                }

                // Remove processed words
                processedWords = dataWords.splice(0, nWordsReady);
                data.sigBytes -= nBytesReady;
            }

            // Return processed words
            return new WordArray.init(processedWords, nBytesReady);
        },

        /**
         * Creates a copy of this object.
         *
         * @return {Object} The clone.
         *
         * @example
         *
         *     var clone = bufferedBlockAlgorithm.clone();
         */
        clone: function () {
            var clone = Base.clone.call(this);
            clone._data = this._data.clone();

            return clone;
        },

        _minBufferSize: 0
    });

    /**
     * Abstract hasher template.
     *
     * @property {number} blockSize The number of 32-bit words this hasher operates on. Default: 16 (512 bits)
     */
    var Hasher = C_lib.Hasher = BufferedBlockAlgorithm.extend({
        /**
         * Configuration options.
         */
        cfg: Base.extend(),

        /**
         * Initializes a newly created hasher.
         *
         * @param {Object} cfg (Optional) The configuration options to use for this hash computation.
         *
         * @example
         *
         *     var hasher = CryptoJS.algo.SHA256.create();
         */
        init: function (cfg) {
            // Apply config defaults
            this.cfg = this.cfg.extend(cfg);

            // Set initial values
            this.reset();
        },

        /**
         * Resets this hasher to its initial state.
         *
         * @example
         *
         *     hasher.reset();
         */
        reset: function () {
            // Reset data buffer
            BufferedBlockAlgorithm.reset.call(this);

            // Perform concrete-hasher logic
            this._doReset();
        },

        /**
         * Updates this hasher with a message.
         *
         * @param {WordArray|string} messageUpdate The message to append.
         *
         * @return {Hasher} This hasher.
         *
         * @example
         *
         *     hasher.update('message');
         *     hasher.update(wordArray);
         */
        update: function (messageUpdate) {
            // Append
            this._append(messageUpdate);

            // Update the hash
            this._process();

            // Chainable
            return this;
        },

        /**
         * Finalizes the hash computation.
         * Note that the finalize operation is effectively a destructive, read-once operation.
         *
         * @param {WordArray|string} messageUpdate (Optional) A final message update.
         *
         * @return {WordArray} The hash.
         *
         * @example
         *
         *     var hash = hasher.finalize();
         *     var hash = hasher.finalize('message');
         *     var hash = hasher.finalize(wordArray);
         */
        finalize: function (messageUpdate) {
            // Final message update
            if (messageUpdate) {
                this._append(messageUpdate);
            }

            // Perform concrete-hasher logic
            var hash = this._doFinalize();

            return hash;
        },

        blockSize: 512/32,

        /**
         * Creates a shortcut function to a hasher's object interface.
         *
         * @param {Hasher} hasher The hasher to create a helper for.
         *
         * @return {Function} The shortcut function.
         *
         * @static
         *
         * @example
         *
         *     var SHA256 = CryptoJS.lib.Hasher._createHelper(CryptoJS.algo.SHA256);
         */
        _createHelper: function (hasher) {
            return function (message, cfg) {
                return new hasher.init(cfg).finalize(message);
            };
        },

        /**
         * Creates a shortcut function to the HMAC's object interface.
         *
         * @param {Hasher} hasher The hasher to use in this HMAC helper.
         *
         * @return {Function} The shortcut function.
         *
         * @static
         *
         * @example
         *
         *     var HmacSHA256 = CryptoJS.lib.Hasher._createHmacHelper(CryptoJS.algo.SHA256);
         */
        _createHmacHelper: function (hasher) {
            return function (message, key) {
                return new C_algo.HMAC.init(hasher, key).finalize(message);
            };
        }
    });

    /**
     * Algorithm namespace.
     */
    var C_algo = C.algo = {};

    return C;
}(Math));
(function () {
    // Shortcuts
    var C = CryptoJS;
    var C_lib = C.lib;
    var WordArray = C_lib.WordArray;
    var C_enc = C.enc;

    /**
     * Base64 encoding strategy.
     */
    var Base64 = C_enc.Base64 = {
        /**
         * Converts a word array to a Base64 string.
         *
         * @param {WordArray} wordArray The word array.
         *
         * @return {string} The Base64 string.
         *
         * @static
         *
         * @example
         *
         *     var base64String = CryptoJS.enc.Base64.stringify(wordArray);
         */
        stringify: function (wordArray) {
            // Shortcuts
            var words = wordArray.words;
            var sigBytes = wordArray.sigBytes;
            var map = this._map;

            // Clamp excess bits
            wordArray.clamp();

            // Convert
            var base64Chars = [];
            for (var i = 0; i < sigBytes; i += 3) {
                var byte1 = (words[i >>> 2]       >>> (24 - (i % 4) * 8))       & 0xff;
                var byte2 = (words[(i + 1) >>> 2] >>> (24 - ((i + 1) % 4) * 8)) & 0xff;
                var byte3 = (words[(i + 2) >>> 2] >>> (24 - ((i + 2) % 4) * 8)) & 0xff;

                var triplet = (byte1 << 16) | (byte2 << 8) | byte3;

                for (var j = 0; (j < 4) && (i + j * 0.75 < sigBytes); j++) {
                    base64Chars.push(map.charAt((triplet >>> (6 * (3 - j))) & 0x3f));
                }
            }

            // Add padding
            var paddingChar = map.charAt(64);
            if (paddingChar) {
                while (base64Chars.length % 4) {
                    base64Chars.push(paddingChar);
                }
            }

            return base64Chars.join('');
        },

        /**
         * Converts a Base64 string to a word array.
         *
         * @param {string} base64Str The Base64 string.
         *
         * @return {WordArray} The word array.
         *
         * @static
         *
         * @example
         *
         *     var wordArray = CryptoJS.enc.Base64.parse(base64String);
         */
        parse: function (base64Str) {
            // Shortcuts
            var base64StrLength = base64Str.length;
            var map = this._map;
            var reverseMap = this._reverseMap;

            if (!reverseMap) {
                    reverseMap = this._reverseMap = [];
                    for (var j = 0; j < map.length; j++) {
                        reverseMap[map.charCodeAt(j)] = j;
                    }
            }

            // Ignore padding
            var paddingChar = map.charAt(64);
            if (paddingChar) {
                var paddingIndex = base64Str.indexOf(paddingChar);
                if (paddingIndex !== -1) {
                    base64StrLength = paddingIndex;
                }
            }

            // Convert
            return parseLoop(base64Str, base64StrLength, reverseMap);

        },

        _map: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/='
    };

    function parseLoop(base64Str, base64StrLength, reverseMap) {
      var words = [];
      var nBytes = 0;
      for (var i = 0; i < base64StrLength; i++) {
          if (i % 4) {
              var bits1 = reverseMap[base64Str.charCodeAt(i - 1)] << ((i % 4) * 2);
              var bits2 = reverseMap[base64Str.charCodeAt(i)] >>> (6 - (i % 4) * 2);
              var bitsCombined = bits1 | bits2;
              words[nBytes >>> 2] |= bitsCombined << (24 - (nBytes % 4) * 8);
              nBytes++;
          }
      }
      return WordArray.create(words, nBytes);
    }
}());
(function () {
    // Shortcuts
    var C = CryptoJS;
    var C_lib = C.lib;
    var Base = C_lib.Base;
    var C_enc = C.enc;
    var Utf8 = C_enc.Utf8;
    var C_algo = C.algo;

    /**
     * HMAC algorithm.
     */
    var HMAC = C_algo.HMAC = Base.extend({
        /**
         * Initializes a newly created HMAC.
         *
         * @param {Hasher} hasher The hash algorithm to use.
         * @param {WordArray|string} key The secret key.
         *
         * @example
         *
         *     var hmacHasher = CryptoJS.algo.HMAC.create(CryptoJS.algo.SHA256, key);
         */
        init: function (hasher, key) {
            // Init hasher
            hasher = this._hasher = new hasher.init();

            // Convert string to WordArray, else assume WordArray already
            if (typeof key == 'string') {
                key = Utf8.parse(key);
            }

            // Shortcuts
            var hasherBlockSize = hasher.blockSize;
            var hasherBlockSizeBytes = hasherBlockSize * 4;

            // Allow arbitrary length keys
            if (key.sigBytes > hasherBlockSizeBytes) {
                key = hasher.finalize(key);
            }

            // Clamp excess bits
            key.clamp();

            // Clone key for inner and outer pads
            var oKey = this._oKey = key.clone();
            var iKey = this._iKey = key.clone();

            // Shortcuts
            var oKeyWords = oKey.words;
            var iKeyWords = iKey.words;

            // XOR keys with pad constants
            for (var i = 0; i < hasherBlockSize; i++) {
                oKeyWords[i] ^= 0x5c5c5c5c;
                iKeyWords[i] ^= 0x36363636;
            }
            oKey.sigBytes = iKey.sigBytes = hasherBlockSizeBytes;

            // Set initial values
            this.reset();
        },

        /**
         * Resets this HMAC to its initial state.
         *
         * @example
         *
         *     hmacHasher.reset();
         */
        reset: function () {
            // Shortcut
            var hasher = this._hasher;

            // Reset
            hasher.reset();
            hasher.update(this._iKey);
        },

        /**
         * Updates this HMAC with a message.
         *
         * @param {WordArray|string} messageUpdate The message to append.
         *
         * @return {HMAC} This HMAC instance.
         *
         * @example
         *
         *     hmacHasher.update('message');
         *     hmacHasher.update(wordArray);
         */
        update: function (messageUpdate) {
            this._hasher.update(messageUpdate);

            // Chainable
            return this;
        },

        /**
         * Finalizes the HMAC computation.
         * Note that the finalize operation is effectively a destructive, read-once operation.
         *
         * @param {WordArray|string} messageUpdate (Optional) A final message update.
         *
         * @return {WordArray} The HMAC.
         *
         * @example
         *
         *     var hmac = hmacHasher.finalize();
         *     var hmac = hmacHasher.finalize('message');
         *     var hmac = hmacHasher.finalize(wordArray);
         */
        finalize: function (messageUpdate) {
            // Shortcut
            var hasher = this._hasher;

            // Compute HMAC
            var innerHash = hasher.finalize(messageUpdate);
            hasher.reset();
            var hmac = hasher.finalize(this._oKey.clone().concat(innerHash));

            return hmac;
        }
    });
}());
(function (Math) {
    // Shortcuts
    var C = CryptoJS;
    var C_lib = C.lib;
    var WordArray = C_lib.WordArray;
    var Hasher = C_lib.Hasher;
    var C_algo = C.algo;

    // Initialization and round constants tables
    var H = [];
    var K = [];

    // Compute constants
    (function () {
        function isPrime(n) {
            var sqrtN = Math.sqrt(n);
            for (var factor = 2; factor <= sqrtN; factor++) {
                if (!(n % factor)) {
                    return false;
                }
            }

            return true;
        }

        function getFractionalBits(n) {
            return ((n - (n | 0)) * 0x100000000) | 0;
        }

        var n = 2;
        var nPrime = 0;
        while (nPrime < 64) {
            if (isPrime(n)) {
                if (nPrime < 8) {
                    H[nPrime] = getFractionalBits(Math.pow(n, 1 / 2));
                }
                K[nPrime] = getFractionalBits(Math.pow(n, 1 / 3));

                nPrime++;
            }

            n++;
        }
    }());

    // Reusable object
    var W = [];

    /**
     * SHA-256 hash algorithm.
     */
    var SHA256 = C_algo.SHA256 = Hasher.extend({
        _doReset: function () {
            this._hash = new WordArray.init(H.slice(0));
        },

        _doProcessBlock: function (M, offset) {
            // Shortcut
            var H = this._hash.words;

            // Working variables
            var a = H[0];
            var b = H[1];
            var c = H[2];
            var d = H[3];
            var e = H[4];
            var f = H[5];
            var g = H[6];
            var h = H[7];

            // Computation
            for (var i = 0; i < 64; i++) {
                if (i < 16) {
                    W[i] = M[offset + i] | 0;
                } else {
                    var gamma0x = W[i - 15];
                    var gamma0  = ((gamma0x << 25) | (gamma0x >>> 7))  ^
                                  ((gamma0x << 14) | (gamma0x >>> 18)) ^
                                   (gamma0x >>> 3);

                    var gamma1x = W[i - 2];
                    var gamma1  = ((gamma1x << 15) | (gamma1x >>> 17)) ^
                                  ((gamma1x << 13) | (gamma1x >>> 19)) ^
                                   (gamma1x >>> 10);

                    W[i] = gamma0 + W[i - 7] + gamma1 + W[i - 16];
                }

                var ch  = (e & f) ^ (~e & g);
                var maj = (a & b) ^ (a & c) ^ (b & c);

                var sigma0 = ((a << 30) | (a >>> 2)) ^ ((a << 19) | (a >>> 13)) ^ ((a << 10) | (a >>> 22));
                var sigma1 = ((e << 26) | (e >>> 6)) ^ ((e << 21) | (e >>> 11)) ^ ((e << 7)  | (e >>> 25));

                var t1 = h + sigma1 + ch + K[i] + W[i];
                var t2 = sigma0 + maj;

                h = g;
                g = f;
                f = e;
                e = (d + t1) | 0;
                d = c;
                c = b;
                b = a;
                a = (t1 + t2) | 0;
            }

            // Intermediate hash value
            H[0] = (H[0] + a) | 0;
            H[1] = (H[1] + b) | 0;
            H[2] = (H[2] + c) | 0;
            H[3] = (H[3] + d) | 0;
            H[4] = (H[4] + e) | 0;
            H[5] = (H[5] + f) | 0;
            H[6] = (H[6] + g) | 0;
            H[7] = (H[7] + h) | 0;
        },

        _doFinalize: function () {
            // Shortcuts
            var data = this._data;
            var dataWords = data.words;

            var nBitsTotal = this._nDataBytes * 8;
            var nBitsLeft = data.sigBytes * 8;

            // Add padding
            dataWords[nBitsLeft >>> 5] |= 0x80 << (24 - nBitsLeft % 32);
            dataWords[(((nBitsLeft + 64) >>> 9) << 4) + 14] = Math.floor(nBitsTotal / 0x100000000);
            dataWords[(((nBitsLeft + 64) >>> 9) << 4) + 15] = nBitsTotal;
            data.sigBytes = dataWords.length * 4;

            // Hash final blocks
            this._process();

            // Return final computed hash
            return this._hash;
        },

        clone: function () {
            var clone = Hasher.clone.call(this);
            clone._hash = this._hash.clone();

            return clone;
        }
    });

    /**
     * Shortcut function to the hasher's object interface.
     *
     * @param {WordArray|string} message The message to hash.
     *
     * @return {WordArray} The hash.
     *
     * @static
     *
     * @example
     *
     *     var hash = CryptoJS.SHA256('message');
     *     var hash = CryptoJS.SHA256(wordArray);
     */
    C.SHA256 = Hasher._createHelper(SHA256);

    /**
     * Shortcut function to the HMAC's object interface.
     *
     * @param {WordArray|string} message The message to hash.
     * @param {WordArray|string} key The secret key.
     *
     * @return {WordArray} The HMAC.
     *
     * @static
     *
     * @example
     *
     *     var hmac = CryptoJS.HmacSHA256(message, key);
     */
    C.HmacSHA256 = Hasher._createHmacHelper(SHA256);
}(Math));

Paho.MQTT = {Client: Paho.Client, Message: Paho.Message};
module = self.module || {};
module.exports = {TDMMQTTClient};
