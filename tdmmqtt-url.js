/** Encode the password (light obfuscation in urls)
	@param {?string} pwd
	@return {?string}
*/
function encodePwd(pwd) {
	return pwd == null
		? null
		: pwd
			.split("")
			.map(function (c) {
				// light obfuscation
				return (c.charCodeAt(0) ^ 0xa5).toString(16).slice(-2);
			})
			.join("");
}

/** Decode the password (inverse of encodePwd)
	@param {?string} enc
	@return {?string}
*/
function decodePwd(enc) {
	if (enc == null) {
		return null;
	}
	var pwd = "";
	for (var i = 0; i < enc.length / 2; i++) {
		pwd += String.fromCharCode(parseInt(enc.slice(2 * i, 2 * i + 2), 16) ^ 0xa5);
	}
	return pwd;
}

/** Get value corresponding to key in the location hash
	@param {string} key
	@return {string}
*/
function getHashOption(key) {
	var dict = (document.location.hash || "#")
		.slice(1)
		.split("&").map(function (p) {
			return p.split("=").map(decodeURIComponent);
		})
		.reduce(function (acc, p) {
			acc[p[0]] = p[1];
			return acc;
		}, {});
	return dict[key] || null;
}
