define(function(require) {
    var dom = require('./bird.dom');
    var lang = require('./bird.lang');
    var array = require('./bird.array');
    var string = require('./bird.string');
    var util = require('./bird.util');
    var object = require('./bird.object');
    var date = require('./bird.date');
    var logger = require('./bird.logger');
    /*********************************************************************
     *                             ajax/jsonp
     ********************************************************************/


    function Request() {

    }

    (function() {
        var doc = document;
        var interceptors = [];

        function ajaxPreFilter(data) {
            if (interceptors.length) {
                array.forEach(interceptors, function(interceptor) {
                    if (lang.isFunction(interceptor.request)) {
                        interceptor.request(data);
                    }
                });
            }
        }

        function ajaxPostFilter(data, reqData) {
            if (interceptors.length && lang.isNotEmpty(data)) {
                array.forEach(interceptors, function(interceptor) {
                    if (lang.isFunction(interceptor.response)) {
                        var ret = interceptor.response(data, reqData);
                        if (!lang.isUndefinedOrNull(ret)) {
                            data = ret;
                        }
                    }
                });
            }
            return data;
        }


        this.addInterceptor = function(interceptor) {
            lang.isPlainObject(interceptor) && interceptors.push(interceptor);
        };

        this.ajax = function(arg) {
            if (!arg.crossDomain) {
                var rReqHost = /^((?:http|https)\:)\/{2}([^/?#~!|&@=%^$*+]+)/i;
                var arr = rReqHost.exec(arg.url);
                if (arr && arr.length) {
                    if (window.location.protocol !== arr[1].toLowerCase()
                        || window.location.host !== arr[2].toLowerCase()) {
                        arg.crossDomain = true;
                    }
                }
            }
            //init xhr
            var xhr, lnk;
            if (window.XMLHttpRequest) {
                xhr = new XMLHttpRequest();
                if (arg.crossDomain && !("withCredentials" in xhr)) {
                    xhr = null;
                }
            } else {
                if (arg.crossDomain) {
                    if (!lang.isUndefined(window.XDomainRequest)) {
                        xhr = new XDomainRequest();
                    }
                }
                else if (window.ActiveObject) {
                    xhr = new ActiveXObject("Microsoft.XMLHTTP");
                }
            }
            if (!xhr) {
                logger.warn("Your browser not support" + (arg.crossDomain ? " CrossDomain " : " ") + "XmlHttpRequest!");
                return;
            }

            //define default arguments
            var obj = {
                async: true,
                requestType: 'get',
                responseType: ''
            };
            object.extend(obj, arg);

            ajaxPreFilter(obj);

            xhr.onreadystatechange = function() {
                if (xhr.readyState == 4) {
                    if (xhr.status == 200) {
                        if (lang.isFunction(obj.complete)) {
                            var result;
                            if (/^xml$/i.test(obj.responseType)) {
                                result = ajaxPostFilter(this.responseXML, obj);
                                obj.complete(result, this.status);
                            } else {
                                result = this.response || this.responseText;

                                if (lang.isString(result) && /^json$/i.test(obj.responseType)) {
                                    result = typeof JSON !== 'undefined' && lang.isFunction(JSON.parse) ? JSON.parse(result) : new Function('return (' + result + ')')();//eval('(' + result + ')');
                                }
                                result = ajaxPostFilter(result, obj);
                                obj.complete(result, this.status);
                            }
                        }
                    } else {
                        if (lang.isFunction(obj.error)) {
                            obj.error(xhr.statusText, xhr.status);
                        }
                    }
                }
            };

            lnk = obj.url.indexOf('?') === -1 ? '?' : '&';

            obj.data = obj.data && object.jsonToQuery(obj.data);

            if (/^(?:head|get|delete)$/i.test(obj.requestType)) {
                obj.data && (obj.url += lnk + obj.data);
                obj.data = null;
            }
            xhr.open(obj.requestType, obj.url, obj.async);

            if (/^xml$/i.test(obj.responseType)) {
                xhr.overrideMimeType('application/xml');
            }

            try{
                xhr.responseType = obj.responseType;
            }catch(e){}

            if (/^(?:post|put|patch)$/i.test(obj.requestType)) {
                xhr.setRequestHeader("Content-type", "application/x-www-form-urlencoded");
            }

            xhr.send(obj.data);

            return xhr;
        };

        this.post = function(url, data, callback, errorCallback) {
            var arg = {
                url: url,
                data: data,
                requestType: 'post',
                responseType: 'json',
                complete: callback,
                error: errorCallback
            };
            return this.ajax(arg);
        };

        this.get = function(url, data, callback, errorCallback) {
            if (lang.isFunction(data)) {
                if (lang.isFunction(callback)) {
                    errorCallback = callback;
                }
                callback = data;
                data = null;
            }
            var arg = {
                url: url,
                data: data,
                requestType: 'get',
                responseType: 'json',
                complete: callback,
                error: errorCallback
            };
            return this.ajax(arg);
        };

        this.load = function(url, selector, successcallback, errorCallback, async) {
            if (lang.isFunction(selector)) {
                error = successcallback;
                successcallback = selector;
                selector = null;
            }
            var me = this;
            var arg = {
                url: url,
                requestType: 'get',
                responseType: 'text',
                async: lang.isUndefinedOrNull(async) ? true : !!async,
                complete: function(data) {
                    if (selector) {
                        var html = dom.extractHtmlBySelector(selector, data);
                        lang.isFunction(successcallback) && successcallback(html);
                    } else {
                        lang.isFunction(successcallback) && successcallback(data);
                    }

                },
                error: errorCallback
            };
            return this.ajax(arg);
        };

        this.abort = function(xhr) {
            xhr && xhr.abort();
        };


        this.syncLoad = function(url, selector, successcallback, errorCallback) {
            return this.load(url, selector, successcallback, errorCallback, false);
        };

        this.jsonp = function(url, cbname, callback) {
            if (lang.isFunction(cbname)) {
                callback = cbname;
                cbname = null;
            }
            var cb = "jsonp" + date.now(),
                script, header;
            //url = url.replace(/([\?|\&]\w+=)\?/, "$1" + cb);
            url = url + (/\?/.test(url) ? "&" : "?") + (cbname || "callback") + "=" + cb;
            window[cb] = function(r) {
                header.removeChild(script);
                script = null;
                header = null;
                
                try {
                    delete window[cb];
                } catch(e) {
                    window[cb] = null;
                }
                
                callback(r);
            };
            script = doc.createElement('script');
            script.setAttribute('src', url);
            header = doc.getElementsByTagName('head')[0] || doc.getElementsByTagName('body')[0];
            header.appendChild(script);
        };

        this.imageGet = function(url, succuessCallback, errorCallback) {
            url += (url.indexOf('?') !== -1 ? '&' : '?') + '_t=' + new Date().getTime();
            dom.loadImage(url, succuessCallback, errorCallback);
        };
    }).call(Request.prototype);

    return new Request();
});