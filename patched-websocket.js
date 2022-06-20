/*
	Patch to intercept WebSocket and send TDM traffic to MQTT
	Yves Piguet, April-May 2022

	python3 -m http.server
	http://127.0.0.1:8000/index-patched-websocket.html?w=wss%3A%2F%2Ftest.mosquitto.org%3A8081&topic=x-tdm-1234&key=secret
	or
	http://127.0.0.1:8000/index-patched-websocket.html?w=ws%3A%2F%2Fbroker.hivemq.com%3A8000&topic=x-tdm-1234&key=secret

	Description:
	- Tool wants to open a websocket to the tdm. It creates an instance of our WebSocket (a).
	- Our WebSocket (a) recognizes that the target is not the mqtt broker (protocol is not "mqtt").
	- Our WebSocket (a) connects to the mqtt broker via ws, hence a recursive call.
	- Our WebSocket (b) recognizes that the target is the mqtt broker (protocol is "mqtt).
 	- Our WebSocket (b) creates a real websocket to the broker.
	- Our WebSocket (a) redirects the packets to and from the broker.

*/

// MQTT
var WS0 = WebSocket;

WebSocket = class {
	constructor(url, protocols) {

		/** Get value corresponding to key in the query or hash string (hash is discarded by Scratch)
			@param {string} key
			@return {string}
		*/
		function getQueryOrHashOption(key) {
			var dict = (document.location.search || "?")
				.slice(1)
				.split("&")
				.concat(document.location.hash.length > 1
					? document.location.hash.slice(1).split("&")
					: [])
				.map(p => {
					return p.split("=").map(decodeURIComponent);
				})
				.reduce((acc, p) => {
					acc[p[0]] = p[1];
					return acc;
				}, {});
			return dict[key] || null;
		}

		/** Extract protocol, address, port and path from websocket url
			@param {string} url
			@return {?{protocol:string,address:string,port:number,path:string}}
		*/
		function parseUrl(url) {
			var re = /^(ws|wss):\/\/([-a-zA-Z0-9.]*)(:(\d+))?(\/.*)?$/.exec(url);
			if (!re || (re[1] !== "ws" && re[1] !== "wss")) {
				return null;
			}
			var useSSL = re[1] === "wss";
			return {
				protocol: re[1],
				address: re[2],
				port: re[4] ? parseInt(re[4], 10) : useSSL ? 443 : 80,
				path: re[5]
			};
		}

		this._url = url;

		this.ws = null;

		this.mqtt = null;
		this._readyState = 0;
		this._onclose = null;
		this._onerror = null;
		this._onmessage = null;
		this._onopen = null;

		var parsedUrl = parseUrl(url);
		if (parsedUrl == null) {
			throw "bad url";
		}
		if (protocols && protocols[0].slice(0, 4) === "mqtt") {
			// broker: real websocket
			this.ws = new WS0(url, protocols);
			this.ws.binaryType = "arraybuffer";
			this.ws.addEventListener("close", event => {
				if (this._onclose) {
					this._onclose(event);
				}
				this._readyState = 3;
			});
			this.ws.addEventListener("error", event => {
				if (this._onerror) {
					this._onerror(event);
				}
			});
			this.ws.addEventListener("message", event => {
				if (this._onmessage) {
					this._onmessage(event);
				}
			});
			this.ws.addEventListener("open", event => {
				if (this._onopen) {
					this._onopen(event);
				}
				this._readyState = 1;
			});
		} else {
			// other: must be tdm, redirect to mqtt
			var broker = getQueryOrHashOption("broker");
			var port = parseInt(getQueryOrHashOption("port") || "0", 10);
			var username = getHashOption("user");
			var password = decodePwd(getHashOption("pwd"));
			var topic = getQueryOrHashOption("topic") || "a";
			var key = getQueryOrHashOption("key") || "b";
			var qos = parseInt(getQueryOrHashOption("qos"), 10);
			var useSSL = true;
			var url = getQueryOrHashOption("brokerurl");
			if (url) {
				var re = /^(ws|wss):\/\/([-a-zA-Z0-9.]*)(:(\d+))?\/?$/.exec(url);
				if (re && (re[1] === "ws" || re[1] === "wss")) {
					useSSL = re[1] === "wss";
					broker = re[2];
					port = re[4] ? parseInt(re[4], 10) : useSSL ? 443 : 80;
				}
			}

			this.mqtt = new TDMMQTTClient(broker, port, useSSL, username, password,
				topic, key, qos);
			this.id = self.crypto.randomUUID();
			this.mqtt.connect(() => {
				this.mqtt.subscribe(topic + "-R", msg => {
					if (this._onmessage && msg.props.type === "tdm_packet") {
						var event = {
							data: Message.strToUint8(atob(msg.props.data))
						};
						this._onmessage(event);
					}
				});
				if (this._onopen) {
					var event = {};
					this._onopen(event);
				}
				this._readyState = 1;
			});
		}

		WebSocket.openInstances.push(this);
	}

	get url() {
		return this._url;
	}

	static get CONNECTING() {
		return 0;
	}
	static get OPEN() {
		return 1;
	}
	static get CLOSING() {
		return 2;
	}
	static get CLOSED() {
		return 3;
	}

	get readyState() {
		return this.ws ? this.ws.readyState : this._readyState;
	}

	get binaryType() {
		return this.ws ? this.ws.binaryType : "arraybuffer";
	}
	set binaryType(value) {
		if (this.ws) {
			this.ws.binaryType = value;
		}
	}

	get bufferedAmount() {
		return this.ws ? this.ws.bufferedAmount : 0;
	}

	addEventListener(name, fun) {
		switch (name) {
		case "close":
			this._onclose = fun;
			break;
		case "error":
			this._onerror = fun;
			break;
		case "message":
			this._onmessage = fun;
			break;
		case "open":
			this._onopen = fun;
			break;
		default:
			throw "patched WebSocket.addEventListener: unknown name " + name;
		}
	}

	set onclose(value) {
		this._onclose = value;
	}

	set onerror(value) {
		this._onerror = value;
	}

	set onmessage(value) {
		this._onmessage = value;
	}

	set onopen(value) {
		this._onopen = value;
	}

	close() {
		this._readyState = 2;
		if (this.ws) {
			this.ws.close();
		} else {
			mqtt.send({
				"type": "close"
			});
		}
		const i = WebSocket.openInstances.indexOf(this);
		if (i >= 0) {
			WebSocket.openInstances.splice(i, 1);
		}
	}

	static closeAll() {
		while (WebSocket.openInstances.length > 0) {
			console.info("closing", WebSocket.openInstances[0]);
			WebSocket.openInstances[0].close();
		}
	}

	send(data) {
		if (this.ws) {
			this.ws.send(data);
		} else {
			this.mqtt.send({
				"type": "tdm_packet",
				"id": this.id,
				"data": btoa(Message.uint8ToStr(data))
			});
		}
	}
};

WebSocket.openInstances = [];
window.addEventListener("unload", () => {
	// not reliable (see <https://developer.mozilla.org/en-US/docs/Web/API/Window/unload_event>)
	WebSocket.closeAll();
});
