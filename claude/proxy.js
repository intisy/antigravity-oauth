// @bun
var __create = Object.create;
var __getProtoOf = Object.getPrototypeOf;
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
function __accessProp(key) {
  return this[key];
}
var __toESMCache_node;
var __toESMCache_esm;
var __toESM = (mod, isNodeMode, target) => {
  var canCache = mod != null && typeof mod === "object";
  if (canCache) {
    var cache = isNodeMode ? __toESMCache_node ??= new WeakMap : __toESMCache_esm ??= new WeakMap;
    var cached = cache.get(mod);
    if (cached)
      return cached;
  }
  target = mod != null ? __create(__getProtoOf(mod)) : {};
  const to = isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target;
  for (let key of __getOwnPropNames(mod))
    if (!__hasOwnProp.call(to, key))
      __defProp(to, key, {
        get: __accessProp.bind(mod, key),
        enumerable: true
      });
  if (canCache)
    cache.set(mod, to);
  return to;
};
var __commonJS = (cb, mod) => () => (mod || cb((mod = { exports: {} }).exports, mod), mod.exports);
var __require = import.meta.require;

// node_modules/graceful-fs/polyfills.js
var require_polyfills = __commonJS((exports, module) => {
  var constants = __require("constants");
  var origCwd = process.cwd;
  var cwd = null;
  var platform = process.env.GRACEFUL_FS_PLATFORM || process.platform;
  process.cwd = function() {
    if (!cwd)
      cwd = origCwd.call(process);
    return cwd;
  };
  try {
    process.cwd();
  } catch (er) {}
  if (typeof process.chdir === "function") {
    chdir = process.chdir;
    process.chdir = function(d) {
      cwd = null;
      chdir.call(process, d);
    };
    if (Object.setPrototypeOf)
      Object.setPrototypeOf(process.chdir, chdir);
  }
  var chdir;
  module.exports = patch;
  function patch(fs) {
    if (constants.hasOwnProperty("O_SYMLINK") && process.version.match(/^v0\.6\.[0-2]|^v0\.5\./)) {
      patchLchmod(fs);
    }
    if (!fs.lutimes) {
      patchLutimes(fs);
    }
    fs.chown = chownFix(fs.chown);
    fs.fchown = chownFix(fs.fchown);
    fs.lchown = chownFix(fs.lchown);
    fs.chmod = chmodFix(fs.chmod);
    fs.fchmod = chmodFix(fs.fchmod);
    fs.lchmod = chmodFix(fs.lchmod);
    fs.chownSync = chownFixSync(fs.chownSync);
    fs.fchownSync = chownFixSync(fs.fchownSync);
    fs.lchownSync = chownFixSync(fs.lchownSync);
    fs.chmodSync = chmodFixSync(fs.chmodSync);
    fs.fchmodSync = chmodFixSync(fs.fchmodSync);
    fs.lchmodSync = chmodFixSync(fs.lchmodSync);
    fs.stat = statFix(fs.stat);
    fs.fstat = statFix(fs.fstat);
    fs.lstat = statFix(fs.lstat);
    fs.statSync = statFixSync(fs.statSync);
    fs.fstatSync = statFixSync(fs.fstatSync);
    fs.lstatSync = statFixSync(fs.lstatSync);
    if (fs.chmod && !fs.lchmod) {
      fs.lchmod = function(path, mode, cb) {
        if (cb)
          process.nextTick(cb);
      };
      fs.lchmodSync = function() {};
    }
    if (fs.chown && !fs.lchown) {
      fs.lchown = function(path, uid, gid, cb) {
        if (cb)
          process.nextTick(cb);
      };
      fs.lchownSync = function() {};
    }
    if (platform === "win32") {
      fs.rename = typeof fs.rename !== "function" ? fs.rename : function(fs$rename) {
        function rename(from, to, cb) {
          var start = Date.now();
          var backoff = 0;
          fs$rename(from, to, function CB(er) {
            if (er && (er.code === "EACCES" || er.code === "EPERM" || er.code === "EBUSY") && Date.now() - start < 60000) {
              setTimeout(function() {
                fs.stat(to, function(stater, st) {
                  if (stater && stater.code === "ENOENT")
                    fs$rename(from, to, CB);
                  else
                    cb(er);
                });
              }, backoff);
              if (backoff < 100)
                backoff += 10;
              return;
            }
            if (cb)
              cb(er);
          });
        }
        if (Object.setPrototypeOf)
          Object.setPrototypeOf(rename, fs$rename);
        return rename;
      }(fs.rename);
    }
    fs.read = typeof fs.read !== "function" ? fs.read : function(fs$read) {
      function read(fd, buffer, offset, length, position, callback_) {
        var callback;
        if (callback_ && typeof callback_ === "function") {
          var eagCounter = 0;
          callback = function(er, _, __) {
            if (er && er.code === "EAGAIN" && eagCounter < 10) {
              eagCounter++;
              return fs$read.call(fs, fd, buffer, offset, length, position, callback);
            }
            callback_.apply(this, arguments);
          };
        }
        return fs$read.call(fs, fd, buffer, offset, length, position, callback);
      }
      if (Object.setPrototypeOf)
        Object.setPrototypeOf(read, fs$read);
      return read;
    }(fs.read);
    fs.readSync = typeof fs.readSync !== "function" ? fs.readSync : function(fs$readSync) {
      return function(fd, buffer, offset, length, position) {
        var eagCounter = 0;
        while (true) {
          try {
            return fs$readSync.call(fs, fd, buffer, offset, length, position);
          } catch (er) {
            if (er.code === "EAGAIN" && eagCounter < 10) {
              eagCounter++;
              continue;
            }
            throw er;
          }
        }
      };
    }(fs.readSync);
    function patchLchmod(fs2) {
      fs2.lchmod = function(path, mode, callback) {
        fs2.open(path, constants.O_WRONLY | constants.O_SYMLINK, mode, function(err, fd) {
          if (err) {
            if (callback)
              callback(err);
            return;
          }
          fs2.fchmod(fd, mode, function(err2) {
            fs2.close(fd, function(err22) {
              if (callback)
                callback(err2 || err22);
            });
          });
        });
      };
      fs2.lchmodSync = function(path, mode) {
        var fd = fs2.openSync(path, constants.O_WRONLY | constants.O_SYMLINK, mode);
        var threw = true;
        var ret;
        try {
          ret = fs2.fchmodSync(fd, mode);
          threw = false;
        } finally {
          if (threw) {
            try {
              fs2.closeSync(fd);
            } catch (er) {}
          } else {
            fs2.closeSync(fd);
          }
        }
        return ret;
      };
    }
    function patchLutimes(fs2) {
      if (constants.hasOwnProperty("O_SYMLINK") && fs2.futimes) {
        fs2.lutimes = function(path, at, mt, cb) {
          fs2.open(path, constants.O_SYMLINK, function(er, fd) {
            if (er) {
              if (cb)
                cb(er);
              return;
            }
            fs2.futimes(fd, at, mt, function(er2) {
              fs2.close(fd, function(er22) {
                if (cb)
                  cb(er2 || er22);
              });
            });
          });
        };
        fs2.lutimesSync = function(path, at, mt) {
          var fd = fs2.openSync(path, constants.O_SYMLINK);
          var ret;
          var threw = true;
          try {
            ret = fs2.futimesSync(fd, at, mt);
            threw = false;
          } finally {
            if (threw) {
              try {
                fs2.closeSync(fd);
              } catch (er) {}
            } else {
              fs2.closeSync(fd);
            }
          }
          return ret;
        };
      } else if (fs2.futimes) {
        fs2.lutimes = function(_a, _b, _c, cb) {
          if (cb)
            process.nextTick(cb);
        };
        fs2.lutimesSync = function() {};
      }
    }
    function chmodFix(orig) {
      if (!orig)
        return orig;
      return function(target, mode, cb) {
        return orig.call(fs, target, mode, function(er) {
          if (chownErOk(er))
            er = null;
          if (cb)
            cb.apply(this, arguments);
        });
      };
    }
    function chmodFixSync(orig) {
      if (!orig)
        return orig;
      return function(target, mode) {
        try {
          return orig.call(fs, target, mode);
        } catch (er) {
          if (!chownErOk(er))
            throw er;
        }
      };
    }
    function chownFix(orig) {
      if (!orig)
        return orig;
      return function(target, uid, gid, cb) {
        return orig.call(fs, target, uid, gid, function(er) {
          if (chownErOk(er))
            er = null;
          if (cb)
            cb.apply(this, arguments);
        });
      };
    }
    function chownFixSync(orig) {
      if (!orig)
        return orig;
      return function(target, uid, gid) {
        try {
          return orig.call(fs, target, uid, gid);
        } catch (er) {
          if (!chownErOk(er))
            throw er;
        }
      };
    }
    function statFix(orig) {
      if (!orig)
        return orig;
      return function(target, options, cb) {
        if (typeof options === "function") {
          cb = options;
          options = null;
        }
        function callback(er, stats) {
          if (stats) {
            if (stats.uid < 0)
              stats.uid += 4294967296;
            if (stats.gid < 0)
              stats.gid += 4294967296;
          }
          if (cb)
            cb.apply(this, arguments);
        }
        return options ? orig.call(fs, target, options, callback) : orig.call(fs, target, callback);
      };
    }
    function statFixSync(orig) {
      if (!orig)
        return orig;
      return function(target, options) {
        var stats = options ? orig.call(fs, target, options) : orig.call(fs, target);
        if (stats) {
          if (stats.uid < 0)
            stats.uid += 4294967296;
          if (stats.gid < 0)
            stats.gid += 4294967296;
        }
        return stats;
      };
    }
    function chownErOk(er) {
      if (!er)
        return true;
      if (er.code === "ENOSYS")
        return true;
      var nonroot = !process.getuid || process.getuid() !== 0;
      if (nonroot) {
        if (er.code === "EINVAL" || er.code === "EPERM")
          return true;
      }
      return false;
    }
  }
});

// node_modules/graceful-fs/legacy-streams.js
var require_legacy_streams = __commonJS((exports, module) => {
  var Stream = __require("stream").Stream;
  module.exports = legacy;
  function legacy(fs) {
    return {
      ReadStream,
      WriteStream
    };
    function ReadStream(path, options) {
      if (!(this instanceof ReadStream))
        return new ReadStream(path, options);
      Stream.call(this);
      var self = this;
      this.path = path;
      this.fd = null;
      this.readable = true;
      this.paused = false;
      this.flags = "r";
      this.mode = 438;
      this.bufferSize = 64 * 1024;
      options = options || {};
      var keys = Object.keys(options);
      for (var index = 0, length = keys.length;index < length; index++) {
        var key = keys[index];
        this[key] = options[key];
      }
      if (this.encoding)
        this.setEncoding(this.encoding);
      if (this.start !== undefined) {
        if (typeof this.start !== "number") {
          throw TypeError("start must be a Number");
        }
        if (this.end === undefined) {
          this.end = Infinity;
        } else if (typeof this.end !== "number") {
          throw TypeError("end must be a Number");
        }
        if (this.start > this.end) {
          throw new Error("start must be <= end");
        }
        this.pos = this.start;
      }
      if (this.fd !== null) {
        process.nextTick(function() {
          self._read();
        });
        return;
      }
      fs.open(this.path, this.flags, this.mode, function(err, fd) {
        if (err) {
          self.emit("error", err);
          self.readable = false;
          return;
        }
        self.fd = fd;
        self.emit("open", fd);
        self._read();
      });
    }
    function WriteStream(path, options) {
      if (!(this instanceof WriteStream))
        return new WriteStream(path, options);
      Stream.call(this);
      this.path = path;
      this.fd = null;
      this.writable = true;
      this.flags = "w";
      this.encoding = "binary";
      this.mode = 438;
      this.bytesWritten = 0;
      options = options || {};
      var keys = Object.keys(options);
      for (var index = 0, length = keys.length;index < length; index++) {
        var key = keys[index];
        this[key] = options[key];
      }
      if (this.start !== undefined) {
        if (typeof this.start !== "number") {
          throw TypeError("start must be a Number");
        }
        if (this.start < 0) {
          throw new Error("start must be >= zero");
        }
        this.pos = this.start;
      }
      this.busy = false;
      this._queue = [];
      if (this.fd === null) {
        this._open = fs.open;
        this._queue.push([this._open, this.path, this.flags, this.mode, undefined]);
        this.flush();
      }
    }
  }
});

// node_modules/graceful-fs/clone.js
var require_clone = __commonJS((exports, module) => {
  module.exports = clone;
  var getPrototypeOf = Object.getPrototypeOf || function(obj) {
    return obj.__proto__;
  };
  function clone(obj) {
    if (obj === null || typeof obj !== "object")
      return obj;
    if (obj instanceof Object)
      var copy = { __proto__: getPrototypeOf(obj) };
    else
      var copy = Object.create(null);
    Object.getOwnPropertyNames(obj).forEach(function(key) {
      Object.defineProperty(copy, key, Object.getOwnPropertyDescriptor(obj, key));
    });
    return copy;
  }
});

// node_modules/graceful-fs/graceful-fs.js
var require_graceful_fs = __commonJS((exports, module) => {
  var fs = __require("fs");
  var polyfills = require_polyfills();
  var legacy = require_legacy_streams();
  var clone = require_clone();
  var util = __require("util");
  var gracefulQueue;
  var previousSymbol;
  if (typeof Symbol === "function" && typeof Symbol.for === "function") {
    gracefulQueue = Symbol.for("graceful-fs.queue");
    previousSymbol = Symbol.for("graceful-fs.previous");
  } else {
    gracefulQueue = "___graceful-fs.queue";
    previousSymbol = "___graceful-fs.previous";
  }
  function noop() {}
  function publishQueue(context, queue2) {
    Object.defineProperty(context, gracefulQueue, {
      get: function() {
        return queue2;
      }
    });
  }
  var debug = noop;
  if (util.debuglog)
    debug = util.debuglog("gfs4");
  else if (/\bgfs4\b/i.test(process.env.NODE_DEBUG || ""))
    debug = function() {
      var m = util.format.apply(util, arguments);
      m = "GFS4: " + m.split(/\n/).join(`
GFS4: `);
      console.error(m);
    };
  if (!fs[gracefulQueue]) {
    queue = global[gracefulQueue] || [];
    publishQueue(fs, queue);
    fs.close = function(fs$close) {
      function close(fd, cb) {
        return fs$close.call(fs, fd, function(err) {
          if (!err) {
            resetQueue();
          }
          if (typeof cb === "function")
            cb.apply(this, arguments);
        });
      }
      Object.defineProperty(close, previousSymbol, {
        value: fs$close
      });
      return close;
    }(fs.close);
    fs.closeSync = function(fs$closeSync) {
      function closeSync(fd) {
        fs$closeSync.apply(fs, arguments);
        resetQueue();
      }
      Object.defineProperty(closeSync, previousSymbol, {
        value: fs$closeSync
      });
      return closeSync;
    }(fs.closeSync);
    if (/\bgfs4\b/i.test(process.env.NODE_DEBUG || "")) {
      process.on("exit", function() {
        debug(fs[gracefulQueue]);
        __require("assert").equal(fs[gracefulQueue].length, 0);
      });
    }
  }
  var queue;
  if (!global[gracefulQueue]) {
    publishQueue(global, fs[gracefulQueue]);
  }
  module.exports = patch(clone(fs));
  if (process.env.TEST_GRACEFUL_FS_GLOBAL_PATCH && !fs.__patched) {
    module.exports = patch(fs);
    fs.__patched = true;
  }
  function patch(fs2) {
    polyfills(fs2);
    fs2.gracefulify = patch;
    fs2.createReadStream = createReadStream;
    fs2.createWriteStream = createWriteStream;
    var fs$readFile = fs2.readFile;
    fs2.readFile = readFile;
    function readFile(path, options, cb) {
      if (typeof options === "function")
        cb = options, options = null;
      return go$readFile(path, options, cb);
      function go$readFile(path2, options2, cb2, startTime) {
        return fs$readFile(path2, options2, function(err) {
          if (err && (err.code === "EMFILE" || err.code === "ENFILE"))
            enqueue([go$readFile, [path2, options2, cb2], err, startTime || Date.now(), Date.now()]);
          else {
            if (typeof cb2 === "function")
              cb2.apply(this, arguments);
          }
        });
      }
    }
    var fs$writeFile = fs2.writeFile;
    fs2.writeFile = writeFile;
    function writeFile(path, data, options, cb) {
      if (typeof options === "function")
        cb = options, options = null;
      return go$writeFile(path, data, options, cb);
      function go$writeFile(path2, data2, options2, cb2, startTime) {
        return fs$writeFile(path2, data2, options2, function(err) {
          if (err && (err.code === "EMFILE" || err.code === "ENFILE"))
            enqueue([go$writeFile, [path2, data2, options2, cb2], err, startTime || Date.now(), Date.now()]);
          else {
            if (typeof cb2 === "function")
              cb2.apply(this, arguments);
          }
        });
      }
    }
    var fs$appendFile = fs2.appendFile;
    if (fs$appendFile)
      fs2.appendFile = appendFile;
    function appendFile(path, data, options, cb) {
      if (typeof options === "function")
        cb = options, options = null;
      return go$appendFile(path, data, options, cb);
      function go$appendFile(path2, data2, options2, cb2, startTime) {
        return fs$appendFile(path2, data2, options2, function(err) {
          if (err && (err.code === "EMFILE" || err.code === "ENFILE"))
            enqueue([go$appendFile, [path2, data2, options2, cb2], err, startTime || Date.now(), Date.now()]);
          else {
            if (typeof cb2 === "function")
              cb2.apply(this, arguments);
          }
        });
      }
    }
    var fs$copyFile = fs2.copyFile;
    if (fs$copyFile)
      fs2.copyFile = copyFile;
    function copyFile(src, dest, flags, cb) {
      if (typeof flags === "function") {
        cb = flags;
        flags = 0;
      }
      return go$copyFile(src, dest, flags, cb);
      function go$copyFile(src2, dest2, flags2, cb2, startTime) {
        return fs$copyFile(src2, dest2, flags2, function(err) {
          if (err && (err.code === "EMFILE" || err.code === "ENFILE"))
            enqueue([go$copyFile, [src2, dest2, flags2, cb2], err, startTime || Date.now(), Date.now()]);
          else {
            if (typeof cb2 === "function")
              cb2.apply(this, arguments);
          }
        });
      }
    }
    var fs$readdir = fs2.readdir;
    fs2.readdir = readdir;
    var noReaddirOptionVersions = /^v[0-5]\./;
    function readdir(path, options, cb) {
      if (typeof options === "function")
        cb = options, options = null;
      var go$readdir = noReaddirOptionVersions.test(process.version) ? function go$readdir2(path2, options2, cb2, startTime) {
        return fs$readdir(path2, fs$readdirCallback(path2, options2, cb2, startTime));
      } : function go$readdir2(path2, options2, cb2, startTime) {
        return fs$readdir(path2, options2, fs$readdirCallback(path2, options2, cb2, startTime));
      };
      return go$readdir(path, options, cb);
      function fs$readdirCallback(path2, options2, cb2, startTime) {
        return function(err, files) {
          if (err && (err.code === "EMFILE" || err.code === "ENFILE"))
            enqueue([
              go$readdir,
              [path2, options2, cb2],
              err,
              startTime || Date.now(),
              Date.now()
            ]);
          else {
            if (files && files.sort)
              files.sort();
            if (typeof cb2 === "function")
              cb2.call(this, err, files);
          }
        };
      }
    }
    if (process.version.substr(0, 4) === "v0.8") {
      var legStreams = legacy(fs2);
      ReadStream = legStreams.ReadStream;
      WriteStream = legStreams.WriteStream;
    }
    var fs$ReadStream = fs2.ReadStream;
    if (fs$ReadStream) {
      ReadStream.prototype = Object.create(fs$ReadStream.prototype);
      ReadStream.prototype.open = ReadStream$open;
    }
    var fs$WriteStream = fs2.WriteStream;
    if (fs$WriteStream) {
      WriteStream.prototype = Object.create(fs$WriteStream.prototype);
      WriteStream.prototype.open = WriteStream$open;
    }
    Object.defineProperty(fs2, "ReadStream", {
      get: function() {
        return ReadStream;
      },
      set: function(val) {
        ReadStream = val;
      },
      enumerable: true,
      configurable: true
    });
    Object.defineProperty(fs2, "WriteStream", {
      get: function() {
        return WriteStream;
      },
      set: function(val) {
        WriteStream = val;
      },
      enumerable: true,
      configurable: true
    });
    var FileReadStream = ReadStream;
    Object.defineProperty(fs2, "FileReadStream", {
      get: function() {
        return FileReadStream;
      },
      set: function(val) {
        FileReadStream = val;
      },
      enumerable: true,
      configurable: true
    });
    var FileWriteStream = WriteStream;
    Object.defineProperty(fs2, "FileWriteStream", {
      get: function() {
        return FileWriteStream;
      },
      set: function(val) {
        FileWriteStream = val;
      },
      enumerable: true,
      configurable: true
    });
    function ReadStream(path, options) {
      if (this instanceof ReadStream)
        return fs$ReadStream.apply(this, arguments), this;
      else
        return ReadStream.apply(Object.create(ReadStream.prototype), arguments);
    }
    function ReadStream$open() {
      var that = this;
      open(that.path, that.flags, that.mode, function(err, fd) {
        if (err) {
          if (that.autoClose)
            that.destroy();
          that.emit("error", err);
        } else {
          that.fd = fd;
          that.emit("open", fd);
          that.read();
        }
      });
    }
    function WriteStream(path, options) {
      if (this instanceof WriteStream)
        return fs$WriteStream.apply(this, arguments), this;
      else
        return WriteStream.apply(Object.create(WriteStream.prototype), arguments);
    }
    function WriteStream$open() {
      var that = this;
      open(that.path, that.flags, that.mode, function(err, fd) {
        if (err) {
          that.destroy();
          that.emit("error", err);
        } else {
          that.fd = fd;
          that.emit("open", fd);
        }
      });
    }
    function createReadStream(path, options) {
      return new fs2.ReadStream(path, options);
    }
    function createWriteStream(path, options) {
      return new fs2.WriteStream(path, options);
    }
    var fs$open = fs2.open;
    fs2.open = open;
    function open(path, flags, mode, cb) {
      if (typeof mode === "function")
        cb = mode, mode = null;
      return go$open(path, flags, mode, cb);
      function go$open(path2, flags2, mode2, cb2, startTime) {
        return fs$open(path2, flags2, mode2, function(err, fd) {
          if (err && (err.code === "EMFILE" || err.code === "ENFILE"))
            enqueue([go$open, [path2, flags2, mode2, cb2], err, startTime || Date.now(), Date.now()]);
          else {
            if (typeof cb2 === "function")
              cb2.apply(this, arguments);
          }
        });
      }
    }
    return fs2;
  }
  function enqueue(elem) {
    debug("ENQUEUE", elem[0].name, elem[1]);
    fs[gracefulQueue].push(elem);
    retry();
  }
  var retryTimer;
  function resetQueue() {
    var now = Date.now();
    for (var i = 0;i < fs[gracefulQueue].length; ++i) {
      if (fs[gracefulQueue][i].length > 2) {
        fs[gracefulQueue][i][3] = now;
        fs[gracefulQueue][i][4] = now;
      }
    }
    retry();
  }
  function retry() {
    clearTimeout(retryTimer);
    retryTimer = undefined;
    if (fs[gracefulQueue].length === 0)
      return;
    var elem = fs[gracefulQueue].shift();
    var fn = elem[0];
    var args = elem[1];
    var err = elem[2];
    var startTime = elem[3];
    var lastTime = elem[4];
    if (startTime === undefined) {
      debug("RETRY", fn.name, args);
      fn.apply(null, args);
    } else if (Date.now() - startTime >= 60000) {
      debug("TIMEOUT", fn.name, args);
      var cb = args.pop();
      if (typeof cb === "function")
        cb.call(null, err);
    } else {
      var sinceAttempt = Date.now() - lastTime;
      var sinceStart = Math.max(lastTime - startTime, 1);
      var desiredDelay = Math.min(sinceStart * 1.2, 100);
      if (sinceAttempt >= desiredDelay) {
        debug("RETRY", fn.name, args);
        fn.apply(null, args.concat([startTime]));
      } else {
        fs[gracefulQueue].push(elem);
      }
    }
    if (retryTimer === undefined) {
      retryTimer = setTimeout(retry, 0);
    }
  }
});

// node_modules/retry/lib/retry_operation.js
var require_retry_operation = __commonJS((exports, module) => {
  function RetryOperation(timeouts, options) {
    if (typeof options === "boolean") {
      options = { forever: options };
    }
    this._originalTimeouts = JSON.parse(JSON.stringify(timeouts));
    this._timeouts = timeouts;
    this._options = options || {};
    this._maxRetryTime = options && options.maxRetryTime || Infinity;
    this._fn = null;
    this._errors = [];
    this._attempts = 1;
    this._operationTimeout = null;
    this._operationTimeoutCb = null;
    this._timeout = null;
    this._operationStart = null;
    if (this._options.forever) {
      this._cachedTimeouts = this._timeouts.slice(0);
    }
  }
  module.exports = RetryOperation;
  RetryOperation.prototype.reset = function() {
    this._attempts = 1;
    this._timeouts = this._originalTimeouts;
  };
  RetryOperation.prototype.stop = function() {
    if (this._timeout) {
      clearTimeout(this._timeout);
    }
    this._timeouts = [];
    this._cachedTimeouts = null;
  };
  RetryOperation.prototype.retry = function(err) {
    if (this._timeout) {
      clearTimeout(this._timeout);
    }
    if (!err) {
      return false;
    }
    var currentTime = new Date().getTime();
    if (err && currentTime - this._operationStart >= this._maxRetryTime) {
      this._errors.unshift(new Error("RetryOperation timeout occurred"));
      return false;
    }
    this._errors.push(err);
    var timeout = this._timeouts.shift();
    if (timeout === undefined) {
      if (this._cachedTimeouts) {
        this._errors.splice(this._errors.length - 1, this._errors.length);
        this._timeouts = this._cachedTimeouts.slice(0);
        timeout = this._timeouts.shift();
      } else {
        return false;
      }
    }
    var self = this;
    var timer = setTimeout(function() {
      self._attempts++;
      if (self._operationTimeoutCb) {
        self._timeout = setTimeout(function() {
          self._operationTimeoutCb(self._attempts);
        }, self._operationTimeout);
        if (self._options.unref) {
          self._timeout.unref();
        }
      }
      self._fn(self._attempts);
    }, timeout);
    if (this._options.unref) {
      timer.unref();
    }
    return true;
  };
  RetryOperation.prototype.attempt = function(fn, timeoutOps) {
    this._fn = fn;
    if (timeoutOps) {
      if (timeoutOps.timeout) {
        this._operationTimeout = timeoutOps.timeout;
      }
      if (timeoutOps.cb) {
        this._operationTimeoutCb = timeoutOps.cb;
      }
    }
    var self = this;
    if (this._operationTimeoutCb) {
      this._timeout = setTimeout(function() {
        self._operationTimeoutCb();
      }, self._operationTimeout);
    }
    this._operationStart = new Date().getTime();
    this._fn(this._attempts);
  };
  RetryOperation.prototype.try = function(fn) {
    console.log("Using RetryOperation.try() is deprecated");
    this.attempt(fn);
  };
  RetryOperation.prototype.start = function(fn) {
    console.log("Using RetryOperation.start() is deprecated");
    this.attempt(fn);
  };
  RetryOperation.prototype.start = RetryOperation.prototype.try;
  RetryOperation.prototype.errors = function() {
    return this._errors;
  };
  RetryOperation.prototype.attempts = function() {
    return this._attempts;
  };
  RetryOperation.prototype.mainError = function() {
    if (this._errors.length === 0) {
      return null;
    }
    var counts = {};
    var mainError = null;
    var mainErrorCount = 0;
    for (var i = 0;i < this._errors.length; i++) {
      var error = this._errors[i];
      var message = error.message;
      var count = (counts[message] || 0) + 1;
      counts[message] = count;
      if (count >= mainErrorCount) {
        mainError = error;
        mainErrorCount = count;
      }
    }
    return mainError;
  };
});

// node_modules/retry/lib/retry.js
var require_retry = __commonJS((exports) => {
  var RetryOperation = require_retry_operation();
  exports.operation = function(options) {
    var timeouts = exports.timeouts(options);
    return new RetryOperation(timeouts, {
      forever: options && options.forever,
      unref: options && options.unref,
      maxRetryTime: options && options.maxRetryTime
    });
  };
  exports.timeouts = function(options) {
    if (options instanceof Array) {
      return [].concat(options);
    }
    var opts = {
      retries: 10,
      factor: 2,
      minTimeout: 1 * 1000,
      maxTimeout: Infinity,
      randomize: false
    };
    for (var key in options) {
      opts[key] = options[key];
    }
    if (opts.minTimeout > opts.maxTimeout) {
      throw new Error("minTimeout is greater than maxTimeout");
    }
    var timeouts = [];
    for (var i = 0;i < opts.retries; i++) {
      timeouts.push(this.createTimeout(i, opts));
    }
    if (options && options.forever && !timeouts.length) {
      timeouts.push(this.createTimeout(i, opts));
    }
    timeouts.sort(function(a, b) {
      return a - b;
    });
    return timeouts;
  };
  exports.createTimeout = function(attempt, opts) {
    var random = opts.randomize ? Math.random() + 1 : 1;
    var timeout = Math.round(random * opts.minTimeout * Math.pow(opts.factor, attempt));
    timeout = Math.min(timeout, opts.maxTimeout);
    return timeout;
  };
  exports.wrap = function(obj, options, methods) {
    if (options instanceof Array) {
      methods = options;
      options = null;
    }
    if (!methods) {
      methods = [];
      for (var key in obj) {
        if (typeof obj[key] === "function") {
          methods.push(key);
        }
      }
    }
    for (var i = 0;i < methods.length; i++) {
      var method = methods[i];
      var original = obj[method];
      obj[method] = function retryWrapper(original2) {
        var op = exports.operation(options);
        var args = Array.prototype.slice.call(arguments, 1);
        var callback = args.pop();
        args.push(function(err) {
          if (op.retry(err)) {
            return;
          }
          if (err) {
            arguments[0] = op.mainError();
          }
          callback.apply(this, arguments);
        });
        op.attempt(function() {
          original2.apply(obj, args);
        });
      }.bind(obj, original);
      obj[method].options = options;
    }
  };
});

// node_modules/signal-exit/signals.js
var require_signals = __commonJS((exports, module) => {
  module.exports = [
    "SIGABRT",
    "SIGALRM",
    "SIGHUP",
    "SIGINT",
    "SIGTERM"
  ];
  if (process.platform !== "win32") {
    module.exports.push("SIGVTALRM", "SIGXCPU", "SIGXFSZ", "SIGUSR2", "SIGTRAP", "SIGSYS", "SIGQUIT", "SIGIOT");
  }
  if (process.platform === "linux") {
    module.exports.push("SIGIO", "SIGPOLL", "SIGPWR", "SIGSTKFLT", "SIGUNUSED");
  }
});

// node_modules/signal-exit/index.js
var require_signal_exit = __commonJS((exports, module) => {
  var process2 = global.process;
  var processOk = function(process3) {
    return process3 && typeof process3 === "object" && typeof process3.removeListener === "function" && typeof process3.emit === "function" && typeof process3.reallyExit === "function" && typeof process3.listeners === "function" && typeof process3.kill === "function" && typeof process3.pid === "number" && typeof process3.on === "function";
  };
  if (!processOk(process2)) {
    module.exports = function() {
      return function() {};
    };
  } else {
    assert = __require("assert");
    signals = require_signals();
    isWin = /^win/i.test(process2.platform);
    EE = __require("events");
    if (typeof EE !== "function") {
      EE = EE.EventEmitter;
    }
    if (process2.__signal_exit_emitter__) {
      emitter = process2.__signal_exit_emitter__;
    } else {
      emitter = process2.__signal_exit_emitter__ = new EE;
      emitter.count = 0;
      emitter.emitted = {};
    }
    if (!emitter.infinite) {
      emitter.setMaxListeners(Infinity);
      emitter.infinite = true;
    }
    module.exports = function(cb, opts) {
      if (!processOk(global.process)) {
        return function() {};
      }
      assert.equal(typeof cb, "function", "a callback must be provided for exit handler");
      if (loaded === false) {
        load();
      }
      var ev = "exit";
      if (opts && opts.alwaysLast) {
        ev = "afterexit";
      }
      var remove = function() {
        emitter.removeListener(ev, cb);
        if (emitter.listeners("exit").length === 0 && emitter.listeners("afterexit").length === 0) {
          unload();
        }
      };
      emitter.on(ev, cb);
      return remove;
    };
    unload = function unload2() {
      if (!loaded || !processOk(global.process)) {
        return;
      }
      loaded = false;
      signals.forEach(function(sig) {
        try {
          process2.removeListener(sig, sigListeners[sig]);
        } catch (er) {}
      });
      process2.emit = originalProcessEmit;
      process2.reallyExit = originalProcessReallyExit;
      emitter.count -= 1;
    };
    module.exports.unload = unload;
    emit = function emit2(event, code, signal) {
      if (emitter.emitted[event]) {
        return;
      }
      emitter.emitted[event] = true;
      emitter.emit(event, code, signal);
    };
    sigListeners = {};
    signals.forEach(function(sig) {
      sigListeners[sig] = function listener() {
        if (!processOk(global.process)) {
          return;
        }
        var listeners = process2.listeners(sig);
        if (listeners.length === emitter.count) {
          unload();
          emit("exit", null, sig);
          emit("afterexit", null, sig);
          if (isWin && sig === "SIGHUP") {
            sig = "SIGINT";
          }
          process2.kill(process2.pid, sig);
        }
      };
    });
    module.exports.signals = function() {
      return signals;
    };
    loaded = false;
    load = function load2() {
      if (loaded || !processOk(global.process)) {
        return;
      }
      loaded = true;
      emitter.count += 1;
      signals = signals.filter(function(sig) {
        try {
          process2.on(sig, sigListeners[sig]);
          return true;
        } catch (er) {
          return false;
        }
      });
      process2.emit = processEmit;
      process2.reallyExit = processReallyExit;
    };
    module.exports.load = load;
    originalProcessReallyExit = process2.reallyExit;
    processReallyExit = function processReallyExit2(code) {
      if (!processOk(global.process)) {
        return;
      }
      process2.exitCode = code || 0;
      emit("exit", process2.exitCode, null);
      emit("afterexit", process2.exitCode, null);
      originalProcessReallyExit.call(process2, process2.exitCode);
    };
    originalProcessEmit = process2.emit;
    processEmit = function processEmit2(ev, arg) {
      if (ev === "exit" && processOk(global.process)) {
        if (arg !== undefined) {
          process2.exitCode = arg;
        }
        var ret = originalProcessEmit.apply(this, arguments);
        emit("exit", process2.exitCode, null);
        emit("afterexit", process2.exitCode, null);
        return ret;
      } else {
        return originalProcessEmit.apply(this, arguments);
      }
    };
  }
  var assert;
  var signals;
  var isWin;
  var EE;
  var emitter;
  var unload;
  var emit;
  var sigListeners;
  var loaded;
  var load;
  var originalProcessReallyExit;
  var processReallyExit;
  var originalProcessEmit;
  var processEmit;
});

// node_modules/proper-lockfile/lib/mtime-precision.js
var require_mtime_precision = __commonJS((exports, module) => {
  var cacheSymbol = Symbol();
  function probe(file, fs, callback) {
    const cachedPrecision = fs[cacheSymbol];
    if (cachedPrecision) {
      return fs.stat(file, (err, stat) => {
        if (err) {
          return callback(err);
        }
        callback(null, stat.mtime, cachedPrecision);
      });
    }
    const mtime = new Date(Math.ceil(Date.now() / 1000) * 1000 + 5);
    fs.utimes(file, mtime, mtime, (err) => {
      if (err) {
        return callback(err);
      }
      fs.stat(file, (err2, stat) => {
        if (err2) {
          return callback(err2);
        }
        const precision = stat.mtime.getTime() % 1000 === 0 ? "s" : "ms";
        Object.defineProperty(fs, cacheSymbol, { value: precision });
        callback(null, stat.mtime, precision);
      });
    });
  }
  function getMtime(precision) {
    let now = Date.now();
    if (precision === "s") {
      now = Math.ceil(now / 1000) * 1000;
    }
    return new Date(now);
  }
  exports.probe = probe;
  exports.getMtime = getMtime;
});

// node_modules/proper-lockfile/lib/lockfile.js
var require_lockfile = __commonJS((exports, module) => {
  var path = __require("path");
  var fs = require_graceful_fs();
  var retry = require_retry();
  var onExit = require_signal_exit();
  var mtimePrecision = require_mtime_precision();
  var locks = {};
  function getLockFile(file, options) {
    return options.lockfilePath || `${file}.lock`;
  }
  function resolveCanonicalPath(file, options, callback) {
    if (!options.realpath) {
      return callback(null, path.resolve(file));
    }
    options.fs.realpath(file, callback);
  }
  function acquireLock(file, options, callback) {
    const lockfilePath = getLockFile(file, options);
    options.fs.mkdir(lockfilePath, (err) => {
      if (!err) {
        return mtimePrecision.probe(lockfilePath, options.fs, (err2, mtime, mtimePrecision2) => {
          if (err2) {
            options.fs.rmdir(lockfilePath, () => {});
            return callback(err2);
          }
          callback(null, mtime, mtimePrecision2);
        });
      }
      if (err.code !== "EEXIST") {
        return callback(err);
      }
      if (options.stale <= 0) {
        return callback(Object.assign(new Error("Lock file is already being held"), { code: "ELOCKED", file }));
      }
      options.fs.stat(lockfilePath, (err2, stat) => {
        if (err2) {
          if (err2.code === "ENOENT") {
            return acquireLock(file, { ...options, stale: 0 }, callback);
          }
          return callback(err2);
        }
        if (!isLockStale(stat, options)) {
          return callback(Object.assign(new Error("Lock file is already being held"), { code: "ELOCKED", file }));
        }
        removeLock(file, options, (err3) => {
          if (err3) {
            return callback(err3);
          }
          acquireLock(file, { ...options, stale: 0 }, callback);
        });
      });
    });
  }
  function isLockStale(stat, options) {
    return stat.mtime.getTime() < Date.now() - options.stale;
  }
  function removeLock(file, options, callback) {
    options.fs.rmdir(getLockFile(file, options), (err) => {
      if (err && err.code !== "ENOENT") {
        return callback(err);
      }
      callback();
    });
  }
  function updateLock(file, options) {
    const lock2 = locks[file];
    if (lock2.updateTimeout) {
      return;
    }
    lock2.updateDelay = lock2.updateDelay || options.update;
    lock2.updateTimeout = setTimeout(() => {
      lock2.updateTimeout = null;
      options.fs.stat(lock2.lockfilePath, (err, stat) => {
        const isOverThreshold = lock2.lastUpdate + options.stale < Date.now();
        if (err) {
          if (err.code === "ENOENT" || isOverThreshold) {
            return setLockAsCompromised(file, lock2, Object.assign(err, { code: "ECOMPROMISED" }));
          }
          lock2.updateDelay = 1000;
          return updateLock(file, options);
        }
        const isMtimeOurs = lock2.mtime.getTime() === stat.mtime.getTime();
        if (!isMtimeOurs) {
          return setLockAsCompromised(file, lock2, Object.assign(new Error("Unable to update lock within the stale threshold"), { code: "ECOMPROMISED" }));
        }
        const mtime = mtimePrecision.getMtime(lock2.mtimePrecision);
        options.fs.utimes(lock2.lockfilePath, mtime, mtime, (err2) => {
          const isOverThreshold2 = lock2.lastUpdate + options.stale < Date.now();
          if (lock2.released) {
            return;
          }
          if (err2) {
            if (err2.code === "ENOENT" || isOverThreshold2) {
              return setLockAsCompromised(file, lock2, Object.assign(err2, { code: "ECOMPROMISED" }));
            }
            lock2.updateDelay = 1000;
            return updateLock(file, options);
          }
          lock2.mtime = mtime;
          lock2.lastUpdate = Date.now();
          lock2.updateDelay = null;
          updateLock(file, options);
        });
      });
    }, lock2.updateDelay);
    if (lock2.updateTimeout.unref) {
      lock2.updateTimeout.unref();
    }
  }
  function setLockAsCompromised(file, lock2, err) {
    lock2.released = true;
    if (lock2.updateTimeout) {
      clearTimeout(lock2.updateTimeout);
    }
    if (locks[file] === lock2) {
      delete locks[file];
    }
    lock2.options.onCompromised(err);
  }
  function lock(file, options, callback) {
    options = {
      stale: 1e4,
      update: null,
      realpath: true,
      retries: 0,
      fs,
      onCompromised: (err) => {
        throw err;
      },
      ...options
    };
    options.retries = options.retries || 0;
    options.retries = typeof options.retries === "number" ? { retries: options.retries } : options.retries;
    options.stale = Math.max(options.stale || 0, 2000);
    options.update = options.update == null ? options.stale / 2 : options.update || 0;
    options.update = Math.max(Math.min(options.update, options.stale / 2), 1000);
    resolveCanonicalPath(file, options, (err, file2) => {
      if (err) {
        return callback(err);
      }
      const operation = retry.operation(options.retries);
      operation.attempt(() => {
        acquireLock(file2, options, (err2, mtime, mtimePrecision2) => {
          if (operation.retry(err2)) {
            return;
          }
          if (err2) {
            return callback(operation.mainError());
          }
          const lock2 = locks[file2] = {
            lockfilePath: getLockFile(file2, options),
            mtime,
            mtimePrecision: mtimePrecision2,
            options,
            lastUpdate: Date.now()
          };
          updateLock(file2, options);
          callback(null, (releasedCallback) => {
            if (lock2.released) {
              return releasedCallback && releasedCallback(Object.assign(new Error("Lock is already released"), { code: "ERELEASED" }));
            }
            unlock(file2, { ...options, realpath: false }, releasedCallback);
          });
        });
      });
    });
  }
  function unlock(file, options, callback) {
    options = {
      fs,
      realpath: true,
      ...options
    };
    resolveCanonicalPath(file, options, (err, file2) => {
      if (err) {
        return callback(err);
      }
      const lock2 = locks[file2];
      if (!lock2) {
        return callback(Object.assign(new Error("Lock is not acquired/owned by you"), { code: "ENOTACQUIRED" }));
      }
      lock2.updateTimeout && clearTimeout(lock2.updateTimeout);
      lock2.released = true;
      delete locks[file2];
      removeLock(file2, options, callback);
    });
  }
  function check(file, options, callback) {
    options = {
      stale: 1e4,
      realpath: true,
      fs,
      ...options
    };
    options.stale = Math.max(options.stale || 0, 2000);
    resolveCanonicalPath(file, options, (err, file2) => {
      if (err) {
        return callback(err);
      }
      options.fs.stat(getLockFile(file2, options), (err2, stat) => {
        if (err2) {
          return err2.code === "ENOENT" ? callback(null, false) : callback(err2);
        }
        return callback(null, !isLockStale(stat, options));
      });
    });
  }
  function getLocks() {
    return locks;
  }
  onExit(() => {
    for (const file in locks) {
      const options = locks[file].options;
      try {
        options.fs.rmdirSync(getLockFile(file, options));
      } catch (e) {}
    }
  });
  exports.lock = lock;
  exports.unlock = unlock;
  exports.check = check;
  exports.getLocks = getLocks;
});

// node_modules/proper-lockfile/lib/adapter.js
var require_adapter = __commonJS((exports, module) => {
  var fs = require_graceful_fs();
  function createSyncFs(fs2) {
    const methods = ["mkdir", "realpath", "stat", "rmdir", "utimes"];
    const newFs = { ...fs2 };
    methods.forEach((method) => {
      newFs[method] = (...args) => {
        const callback = args.pop();
        let ret;
        try {
          ret = fs2[`${method}Sync`](...args);
        } catch (err) {
          return callback(err);
        }
        callback(null, ret);
      };
    });
    return newFs;
  }
  function toPromise(method) {
    return (...args) => new Promise((resolve, reject) => {
      args.push((err, result) => {
        if (err) {
          reject(err);
        } else {
          resolve(result);
        }
      });
      method(...args);
    });
  }
  function toSync(method) {
    return (...args) => {
      let err;
      let result;
      args.push((_err, _result) => {
        err = _err;
        result = _result;
      });
      method(...args);
      if (err) {
        throw err;
      }
      return result;
    };
  }
  function toSyncOptions(options) {
    options = { ...options };
    options.fs = createSyncFs(options.fs || fs);
    if (typeof options.retries === "number" && options.retries > 0 || options.retries && typeof options.retries.retries === "number" && options.retries.retries > 0) {
      throw Object.assign(new Error("Cannot use retries with the sync api"), { code: "ESYNC" });
    }
    return options;
  }
  module.exports = {
    toPromise,
    toSync,
    toSyncOptions
  };
});

// node_modules/proper-lockfile/index.js
var require_proper_lockfile = __commonJS((exports, module) => {
  var lockfile = require_lockfile();
  var { toPromise, toSync, toSyncOptions } = require_adapter();
  async function lock(file, options) {
    const release = await toPromise(lockfile.lock)(file, options);
    return toPromise(release);
  }
  function lockSync(file, options) {
    const release = toSync(lockfile.lock)(file, toSyncOptions(options));
    return toSync(release);
  }
  function unlock(file, options) {
    return toPromise(lockfile.unlock)(file, options);
  }
  function unlockSync(file, options) {
    return toSync(lockfile.unlock)(file, toSyncOptions(options));
  }
  function check(file, options) {
    return toPromise(lockfile.check)(file, options);
  }
  function checkSync(file, options) {
    return toSync(lockfile.check)(file, toSyncOptions(options));
  }
  module.exports = lock;
  module.exports.lock = lock;
  module.exports.unlock = unlock;
  module.exports.lockSync = lockSync;
  module.exports.unlockSync = unlockSync;
  module.exports.check = check;
  module.exports.checkSync = checkSync;
});

import http from "http";
import https from "https";
import fs2 from "fs";

var ANTIGRAVITY_ENDPOINT_PROD = "https://cloudcode-pa.googleapis.com";
var ANTIGRAVITY_VERSION_FALLBACK = "1.18.3";
var antigravityVersion = ANTIGRAVITY_VERSION_FALLBACK;
function getAntigravityVersion() {
  return antigravityVersion;
}
var ANTIGRAVITY_VERSION = ANTIGRAVITY_VERSION_FALLBACK;
function getAntigravityHeaders() {
  return {
    "User-Agent": `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Antigravity/${getAntigravityVersion()} Chrome/138.0.7204.235 Electron/37.3.1 Safari/537.36`,
    "X-Goog-Api-Client": "google-cloud-sdk vscode_cloudshelleditor/0.1",
    "Client-Metadata": `{"ideType":"ANTIGRAVITY","platform":"${process.platform === "win32" ? "WINDOWS" : "MACOS"}","pluginType":"GEMINI"}`
  };
}
var ANTIGRAVITY_HEADERS = {
  "User-Agent": `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Antigravity/${ANTIGRAVITY_VERSION} Chrome/138.0.7204.235 Electron/37.3.1 Safari/537.36`,
  "X-Goog-Api-Client": "google-cloud-sdk vscode_cloudshelleditor/0.1",
  "Client-Metadata": `{"ideType":"ANTIGRAVITY","platform":"${process.platform === "win32" ? "WINDOWS" : "MACOS"}","pluginType":"GEMINI"}`
};

var ACCESS_TOKEN_EXPIRY_BUFFER_MS = 60 * 1000;
function parseRefreshParts(refresh) {
  const [refreshToken = "", projectId = "", managedProjectId = ""] = (refresh ?? "").split("|");
  return {
    refreshToken,
    projectId: projectId || undefined,
    managedProjectId: managedProjectId || undefined
  };
}
function formatRefreshParts(parts) {
  const projectSegment = parts.projectId ?? "";
  const base = `${parts.refreshToken}|${projectSegment}`;
  return parts.managedProjectId ? `${base}|${parts.managedProjectId}` : base;
}

import { createWriteStream, mkdirSync as mkdirSync2, readdirSync, statSync, unlinkSync as unlinkSync2 } from "fs";
import { join as join2 } from "path";
import { env } from "process";
import { homedir as homedir2 } from "os";

function isTruthyFlag(flag) {
  return flag === "1" || flag?.toLowerCase() === "true";
}
function parseDebugLevel(flag) {
  const trimmed = flag.trim();
  if (trimmed === "2" || trimmed === "verbose")
    return 2;
  if (trimmed === "1" || trimmed === "true")
    return 1;
  return 0;
}
function deriveDebugPolicy(input) {
  const envDebugFlag = input.envDebugFlag ?? "";
  const debugLevel = input.configDebug ? envDebugFlag === "2" || envDebugFlag === "verbose" ? 2 : 1 : parseDebugLevel(envDebugFlag);
  const debugEnabled = debugLevel >= 1;
  const verboseEnabled = debugLevel >= 2;
  const debugTuiEnabled = debugEnabled && (input.configDebugTui || isTruthyFlag(input.envDebugTuiFlag));
  return {
    debugLevel,
    debugEnabled,
    debugTuiEnabled,
    verboseEnabled
  };
}
function formatAccountLabel(email, accountIndex) {
  return email || `Account ${accountIndex + 1}`;
}
function writeConsoleLog(level, ...args) {
  switch (level) {
    case "debug":
      console.debug(...args);
      break;
    case "info":
      console.info(...args);
      break;
    case "warn":
      console.warn(...args);
      break;
    case "error":
      console.error(...args);
      break;
  }
}

var import_proper_lockfile = __toESM(require_proper_lockfile(), 1);
import { promises as fs } from "fs";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  appendFileSync,
  mkdirSync,
  renameSync,
  copyFileSync,
  unlinkSync
} from "fs";
import { dirname, join } from "path";
import { homedir } from "os";
import { randomBytes } from "crypto";

var ENV_CONSOLE_LOG = "OPENCODE_ANTIGRAVITY_CONSOLE_LOG";
var _client = null;
function isConsoleLogEnabled() {
  return isTruthyFlag(process.env[ENV_CONSOLE_LOG]);
}
function createLogger(module) {
  const service = `antigravity.${module}`;
  const log = (level, message, extra) => {
    if (isDebugTuiEnabled()) {
      const app = _client?.app;
      if (app && typeof app.log === "function") {
        app.log({
          body: { service, level, message, extra }
        }).catch(() => {});
      }
    }
    if (isConsoleLogEnabled()) {
      const prefix = `[${service}]`;
      const args = extra ? [prefix, message, extra] : [prefix, message];
      writeConsoleLog(level, ...args);
    }
  };
  return {
    debug: (message, extra) => log("debug", message, extra),
    info: (message, extra) => log("info", message, extra),
    warn: (message, extra) => log("warn", message, extra),
    error: (message, extra) => log("error", message, extra)
  };
}

var log = createLogger("storage");
var GITIGNORE_ENTRIES = [
  "antigravity-accounts.json",
  "antigravity-accounts.json.*.tmp",
  "antigravity-signature-cache.json",
  "antigravity-logs/"
];
async function ensureGitignore(configDir) {
  const gitignorePath = join(configDir, ".gitignore");
  try {
    let content;
    let existingLines = [];
    try {
      content = await fs.readFile(gitignorePath, "utf-8");
      existingLines = content.split(/\r?\n/).map((line) => line.trim());
    } catch (error) {
      if (error.code !== "ENOENT") {
        return;
      }
      content = "";
    }
    const missingEntries = GITIGNORE_ENTRIES.filter((entry) => !existingLines.includes(entry));
    if (missingEntries.length === 0) {
      return;
    }
    if (content === "") {
      await fs.writeFile(gitignorePath, missingEntries.join(`
`) + `
`, "utf-8");
      log.info("Created .gitignore in config directory");
    } else {
      const suffix = content.endsWith(`
`) ? "" : `
`;
      await fs.appendFile(gitignorePath, suffix + missingEntries.join(`
`) + `
`, "utf-8");
      log.info("Updated .gitignore with missing entries", {
        added: missingEntries
      });
    }
  } catch {}
}
function ensureGitignoreSync(configDir) {
  const gitignorePath = join(configDir, ".gitignore");
  try {
    let content;
    let existingLines = [];
    if (existsSync(gitignorePath)) {
      content = readFileSync(gitignorePath, "utf-8");
      existingLines = content.split(/\r?\n/).map((line) => line.trim());
    } else {
      content = "";
    }
    const missingEntries = GITIGNORE_ENTRIES.filter((entry) => !existingLines.includes(entry));
    if (missingEntries.length === 0) {
      return;
    }
    if (content === "") {
      writeFileSync(gitignorePath, missingEntries.join(`
`) + `
`, "utf-8");
      log.info("Created .gitignore in config directory");
    } else {
      const suffix = content.endsWith(`
`) ? "" : `
`;
      appendFileSync(gitignorePath, suffix + missingEntries.join(`
`) + `
`, "utf-8");
      log.info("Updated .gitignore with missing entries", {
        added: missingEntries
      });
    }
  } catch {}
}
function getLegacyWindowsConfigDir() {
  return join(process.env.APPDATA || join(homedir(), "AppData", "Roaming"), "opencode");
}
function getConfigDir() {
  return join(homedir(), ".claude");
}
function migrateLegacyWindowsConfig() {
  if (process.platform !== "win32") {
    return false;
  }
  const configSubDir = join(getConfigDir(), "config");
  const newPath = join(configSubDir, "antigravity-accounts.json");
  const legacyPath = join(getLegacyWindowsConfigDir(), "antigravity-accounts.json");
  if (!existsSync(legacyPath) || existsSync(newPath)) {
    return false;
  }
  try {
    mkdirSync(configSubDir, { recursive: true });
    try {
      renameSync(legacyPath, newPath);
      log.info("Migrated Windows config via rename", { from: legacyPath, to: newPath });
    } catch {
      copyFileSync(legacyPath, newPath);
      unlinkSync(legacyPath);
      log.info("Migrated Windows config via copy+delete", { from: legacyPath, to: newPath });
    }
    return true;
  } catch (error) {
    log.warn("Failed to migrate legacy Windows config, will use legacy path", {
      legacyPath,
      newPath,
      error: String(error)
    });
    return false;
  }
}
function getStoragePathWithMigration() {
  const configSubDir = join(getConfigDir(), "config");
  const newPath = join(configSubDir, "antigravity-accounts.json");
  if (!existsSync(configSubDir)) {
    try {
      mkdirSync(configSubDir, { recursive: true });
    } catch {}
  }
  const rootPath = join(getConfigDir(), "antigravity-accounts.json");
  if (existsSync(rootPath) && !existsSync(newPath)) {
    try {
      copyFileSync(rootPath, newPath);
      log.info("Migrated accounts to config/ subfolder", { from: rootPath, to: newPath });
      try {
        unlinkSync(rootPath);
      } catch {}
    } catch {}
  }
  if (!existsSync(newPath)) {
    const xdgConfig = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
    const opencodeConfigPath = join(xdgConfig, "opencode", "config", "antigravity-accounts.json");
    const opencodeRootPath = join(xdgConfig, "opencode", "antigravity-accounts.json");
    const sourcePath = existsSync(opencodeConfigPath) ? opencodeConfigPath : existsSync(opencodeRootPath) ? opencodeRootPath : null;
    if (sourcePath) {
      try {
        copyFileSync(sourcePath, newPath);
        log.info("Bootstrapped accounts from OpenCode config (one-time migration)", { from: sourcePath, to: newPath });
      } catch {}
    }
  }
  if (process.platform === "win32") {
    migrateLegacyWindowsConfig();
    if (!existsSync(newPath)) {
      const legacyPath = join(getLegacyWindowsConfigDir(), "antigravity-accounts.json");
      if (existsSync(legacyPath)) {
        log.info("Using legacy Windows config path (migration failed)", {
          legacyPath,
          newPath
        });
        return legacyPath;
      }
    }
  }
  return newPath;
}
function getStoragePath() {
  return getStoragePathWithMigration();
}
var LOCK_OPTIONS = {
  stale: 1e4,
  retries: {
    retries: 5,
    minTimeout: 100,
    maxTimeout: 1000,
    factor: 2
  }
};
async function ensureSecurePermissions(path) {
  try {
    await fs.chmod(path, 384);
  } catch {}
}
async function ensureFileExists(path) {
  try {
    await fs.access(path);
  } catch {
    await fs.mkdir(dirname(path), { recursive: true });
    await fs.writeFile(path, JSON.stringify({ version: 4, accounts: [], activeIndex: 0 }, null, 2), { encoding: "utf-8", mode: 384 });
  }
}
async function withFileLock(path, fn) {
  await ensureFileExists(path);
  let release = null;
  try {
    release = await import_proper_lockfile.default.lock(path, LOCK_OPTIONS);
    return await fn();
  } finally {
    if (release) {
      try {
        await release();
      } catch (unlockError) {
        log.warn("Failed to release lock", { error: String(unlockError) });
      }
    }
  }
}
function mergeAccountStorage(existing, incoming) {
  const accountMap = new Map;
  for (const acc of existing.accounts) {
    if (acc.refreshToken) {
      accountMap.set(acc.refreshToken, acc);
    }
  }
  for (const acc of incoming.accounts) {
    if (acc.refreshToken) {
      const existingAcc = accountMap.get(acc.refreshToken);
      if (existingAcc) {
        const mergedRateLimits = { ...existingAcc.rateLimitResetTimes || {} };
        const incomingRateLimits = acc.rateLimitResetTimes || {};
        for (const [key, resetTime] of Object.entries(incomingRateLimits)) {
          if (typeof resetTime === "number") {
            const existingTime = mergedRateLimits[key] || 0;
            mergedRateLimits[key] = Math.max(existingTime, resetTime);
          }
        }
        const coolingDownUntil = Math.max(existingAcc.coolingDownUntil || 0, acc.coolingDownUntil || 0) || undefined;
        let cooldownReason = undefined;
        if (coolingDownUntil) {
          cooldownReason = coolingDownUntil === acc.coolingDownUntil ? acc.cooldownReason : existingAcc.cooldownReason;
        }
        const verificationRequired = existingAcc.verificationRequired || acc.verificationRequired;
        const verificationRequiredAt = Math.max(existingAcc.verificationRequiredAt || 0, acc.verificationRequiredAt || 0) || undefined;
        accountMap.set(acc.refreshToken, {
          ...existingAcc,
          ...acc,
          projectId: acc.projectId ?? existingAcc.projectId,
          managedProjectId: acc.managedProjectId ?? existingAcc.managedProjectId,
          rateLimitResetTimes: mergedRateLimits,
          lastUsed: Math.max(existingAcc.lastUsed || 0, acc.lastUsed || 0),
          coolingDownUntil,
          cooldownReason,
          verificationRequired,
          verificationRequiredAt,
          verificationRequiredReason: acc.verificationRequiredReason || existingAcc.verificationRequiredReason,
          verificationUrl: acc.verificationUrl || existingAcc.verificationUrl,
          enabled: acc.enabled !== undefined ? acc.enabled : existingAcc.enabled
        });
      } else {
        accountMap.set(acc.refreshToken, acc);
      }
    }
  }
  return {
    version: 4,
    accounts: Array.from(accountMap.values()),
    activeIndex: incoming.activeIndex,
    activeIndexByFamily: incoming.activeIndexByFamily
  };
}
function deduplicateAccountsByEmail(accounts) {
  const emailToNewestIndex = new Map;
  const indicesToKeep = new Set;
  for (let i = 0;i < accounts.length; i++) {
    const acc = accounts[i];
    if (!acc)
      continue;
    if (!acc.email) {
      indicesToKeep.add(i);
      continue;
    }
    const existingIndex = emailToNewestIndex.get(acc.email);
    if (existingIndex === undefined) {
      emailToNewestIndex.set(acc.email, i);
      continue;
    }
    const existing = accounts[existingIndex];
    if (!existing) {
      emailToNewestIndex.set(acc.email, i);
      continue;
    }
    const currLastUsed = acc.lastUsed || 0;
    const existLastUsed = existing.lastUsed || 0;
    const currAddedAt = acc.addedAt || 0;
    const existAddedAt = existing.addedAt || 0;
    const isNewer = currLastUsed > existLastUsed || currLastUsed === existLastUsed && currAddedAt > existAddedAt;
    if (isNewer) {
      emailToNewestIndex.set(acc.email, i);
    }
  }
  for (const idx of emailToNewestIndex.values()) {
    indicesToKeep.add(idx);
  }
  const result = [];
  for (let i = 0;i < accounts.length; i++) {
    if (indicesToKeep.has(i)) {
      const acc = accounts[i];
      if (acc) {
        result.push(acc);
      }
    }
  }
  return result;
}
function migrateV1ToV2(v1) {
  return {
    version: 2,
    accounts: v1.accounts.map((acc) => {
      const rateLimitResetTimes = {};
      if (acc.isRateLimited && acc.rateLimitResetTime && acc.rateLimitResetTime > Date.now()) {
        rateLimitResetTimes.claude = acc.rateLimitResetTime;
        rateLimitResetTimes.gemini = acc.rateLimitResetTime;
      }
      return {
        email: acc.email,
        refreshToken: acc.refreshToken,
        projectId: acc.projectId,
        managedProjectId: acc.managedProjectId,
        addedAt: acc.addedAt,
        lastUsed: acc.lastUsed,
        lastSwitchReason: acc.lastSwitchReason,
        rateLimitResetTimes: Object.keys(rateLimitResetTimes).length > 0 ? rateLimitResetTimes : undefined
      };
    }),
    activeIndex: v1.activeIndex
  };
}
function migrateV2ToV3(v2) {
  return {
    version: 3,
    accounts: v2.accounts.map((acc) => {
      const rateLimitResetTimes = {};
      if (acc.rateLimitResetTimes?.claude && acc.rateLimitResetTimes.claude > Date.now()) {
        rateLimitResetTimes.claude = acc.rateLimitResetTimes.claude;
      }
      if (acc.rateLimitResetTimes?.gemini && acc.rateLimitResetTimes.gemini > Date.now()) {
        rateLimitResetTimes["gemini-antigravity"] = acc.rateLimitResetTimes.gemini;
      }
      return {
        email: acc.email,
        refreshToken: acc.refreshToken,
        projectId: acc.projectId,
        managedProjectId: acc.managedProjectId,
        addedAt: acc.addedAt,
        lastUsed: acc.lastUsed,
        lastSwitchReason: acc.lastSwitchReason,
        rateLimitResetTimes: Object.keys(rateLimitResetTimes).length > 0 ? rateLimitResetTimes : undefined
      };
    }),
    activeIndex: v2.activeIndex
  };
}
function migrateV3ToV4(v3) {
  return {
    version: 4,
    accounts: v3.accounts.map((acc) => ({
      ...acc,
      fingerprint: undefined,
      fingerprintHistory: undefined
    })),
    activeIndex: v3.activeIndex,
    activeIndexByFamily: v3.activeIndexByFamily
  };
}
async function loadAccounts() {
  try {
    const path = getStoragePath();
    await ensureSecurePermissions(path);
    const content = await fs.readFile(path, "utf-8");
    const data = JSON.parse(content);
    if (!Array.isArray(data.accounts)) {
      log.warn("Invalid storage format, ignoring");
      return null;
    }
    let storage;
    if (data.version === 1) {
      log.info("Migrating account storage from v1 to v4");
      const v2 = migrateV1ToV2(data);
      const v3 = migrateV2ToV3(v2);
      storage = migrateV3ToV4(v3);
      try {
        await saveAccounts(storage);
        log.info("Migration to v4 complete");
      } catch (saveError) {
        log.warn("Failed to persist migrated storage", {
          error: String(saveError)
        });
      }
    } else if (data.version === 2) {
      log.info("Migrating account storage from v2 to v4");
      const v3 = migrateV2ToV3(data);
      storage = migrateV3ToV4(v3);
      try {
        await saveAccounts(storage);
        log.info("Migration to v4 complete");
      } catch (saveError) {
        log.warn("Failed to persist migrated storage", {
          error: String(saveError)
        });
      }
    } else if (data.version === 3) {
      log.info("Migrating account storage from v3 to v4");
      storage = migrateV3ToV4(data);
      try {
        await saveAccounts(storage);
        log.info("Migration to v4 complete");
      } catch (saveError) {
        log.warn("Failed to persist migrated storage", {
          error: String(saveError)
        });
      }
    } else if (data.version === 4) {
      storage = data;
    } else {
      log.warn("Unknown storage version, ignoring", {
        version: data.version
      });
      return null;
    }
    const validAccounts = storage.accounts.filter((a) => {
      return !!a && typeof a === "object" && typeof a.refreshToken === "string";
    });
    const deduplicatedAccounts = deduplicateAccountsByEmail(validAccounts);
    let activeIndex = typeof storage.activeIndex === "number" && Number.isFinite(storage.activeIndex) ? storage.activeIndex : 0;
    if (deduplicatedAccounts.length > 0) {
      activeIndex = Math.min(activeIndex, deduplicatedAccounts.length - 1);
      activeIndex = Math.max(activeIndex, 0);
    } else {
      activeIndex = 0;
    }
    return {
      version: 4,
      accounts: deduplicatedAccounts,
      activeIndex,
      activeIndexByFamily: storage.activeIndexByFamily
    };
  } catch (error) {
    const code = error.code;
    if (code === "ENOENT") {
      return null;
    }
    log.error("Failed to load account storage", { error: String(error) });
    return null;
  }
}
async function saveAccounts(storage) {
  const path = getStoragePath();
  const configDir = dirname(path);
  await fs.mkdir(configDir, { recursive: true });
  await ensureGitignore(configDir);
  await withFileLock(path, async () => {
    const existing = await loadAccountsUnsafe();
    const merged = existing ? mergeAccountStorage(existing, storage) : storage;
    const tempPath = `${path}.${randomBytes(6).toString("hex")}.tmp`;
    const content = JSON.stringify(merged, null, 2);
    try {
      await fs.writeFile(tempPath, content, { encoding: "utf-8", mode: 384 });
      await fs.rename(tempPath, path);
    } catch (error) {
      try {
        await fs.unlink(tempPath);
      } catch {}
      throw error;
    }
  });
}
async function loadAccountsUnsafe() {
  try {
    const path = getStoragePath();
    await ensureSecurePermissions(path);
    const content = await fs.readFile(path, "utf-8");
    const parsed = JSON.parse(content);
    if (parsed.version === 1) {
      return migrateV3ToV4(migrateV2ToV3(migrateV1ToV2(parsed)));
    }
    if (parsed.version === 2) {
      return migrateV3ToV4(migrateV2ToV3(parsed));
    }
    if (parsed.version === 3) {
      return migrateV3ToV4(parsed);
    }
    return {
      ...parsed,
      accounts: deduplicateAccountsByEmail(parsed.accounts)
    };
  } catch (error) {
    const code = error.code;
    if (code === "ENOENT") {
      return null;
    }
    return null;
  }
}

var debugState = null;
function getConfigDir2() {
  const platform = process.platform;
  if (platform === "win32") {
    return join2(env.APPDATA || join2(homedir2(), "AppData", "Roaming"), "opencode");
  }
  const xdgConfig = env.XDG_CONFIG_HOME || join2(homedir2(), ".config");
  return join2(xdgConfig, "opencode");
}
function getLogsDir(customLogDir) {
  const logsDir = customLogDir || join2(getConfigDir2(), "antigravity-logs");
  try {
    mkdirSync2(logsDir, { recursive: true });
  } catch {}
  return logsDir;
}
function createLogFilePath(customLogDir) {
  const logsDir = getLogsDir(customLogDir);
  cleanupOldLogs(logsDir, 25);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return join2(logsDir, `antigravity-debug-${timestamp}.log`);
}
function cleanupOldLogs(logsDir, maxFiles) {
  try {
    const files = readdirSync(logsDir).filter((file) => file.startsWith("antigravity-debug-") && file.endsWith(".log")).map((file) => join2(logsDir, file));
    if (files.length <= maxFiles) {
      return;
    }
    const sortedFiles = files.map((file) => ({
      file,
      mtime: statSync(file).mtimeMs
    })).sort((a, b) => b.mtime - a.mtime);
    for (let i = maxFiles;i < sortedFiles.length; i++) {
      try {
        unlinkSync2(sortedFiles[i].file);
      } catch {}
    }
  } catch {}
}
function createLogWriter(filePath) {
  if (!filePath) {
    return () => {};
  }
  try {
    const stream = createWriteStream(filePath, { flags: "a" });
    stream.on("error", () => {});
    return (line) => {
      const timestamp = new Date().toISOString();
      const formatted = `[${timestamp}] ${line}`;
      stream.write(`${formatted}
`);
    };
  } catch {
    return () => {};
  }
}
function getDebugState() {
  if (!debugState) {
    const { debugEnabled } = deriveDebugPolicy({
      configDebug: false,
      configDebugTui: false,
      envDebugFlag: env.OPENCODE_ANTIGRAVITY_DEBUG,
      envDebugTuiFlag: env.OPENCODE_ANTIGRAVITY_DEBUG_TUI
    });
    const debugTuiEnabled = isTruthyFlag(env.OPENCODE_ANTIGRAVITY_DEBUG_TUI);
    const logFilePath = debugEnabled ? createLogFilePath() : undefined;
    const logWriter = createLogWriter(logFilePath);
    debugState = {
      debugEnabled,
      debugTuiEnabled,
      logFilePath,
      logWriter
    };
  }
  return debugState;
}
function isDebugTuiEnabled() {
  return getDebugState().debugTuiEnabled;
}
function logDebug(line) {
  getDebugState().logWriter(line);
}
function runWithDebugEnabled(action) {
  if (!getDebugState().debugEnabled)
    return;
  action();
}
function debugLogToFile(message) {
  runWithDebugEnabled(() => {
    logDebug(message);
  });
}

var log2 = createLogger("project");
var projectContextResultCache = new Map;
var projectContextPendingCache = new Map;
var CODE_ASSIST_METADATA = {
  ideType: "ANTIGRAVITY",
  platform: process.platform === "win32" ? "WINDOWS" : "MACOS",
  pluginType: "GEMINI"
};

import { existsSync as existsSync2, mkdirSync as mkdirSync3, readFileSync as readFileSync2, writeFileSync as writeFileSync2, renameSync as renameSync2, unlinkSync as unlinkSync3 } from "fs";
import { join as join3, dirname as dirname2 } from "path";
import { homedir as homedir3 } from "os";
import { tmpdir } from "os";
function getConfigDir3() {
  const platform = process.platform;
  if (platform === "win32") {
    return join3(process.env.APPDATA || join3(homedir3(), "AppData", "Roaming"), "opencode");
  }
  const xdgConfig = process.env.XDG_CONFIG_HOME || join3(homedir3(), ".config");
  return join3(xdgConfig, "opencode");
}
function getCacheFilePath() {
  const configSubDir = join3(getConfigDir3(), "config");
  return join3(configSubDir, "antigravity-signature-cache.json");
}

class SignatureCache {
  cache = new Map;
  memoryTtlMs;
  diskTtlMs;
  writeIntervalMs;
  cacheFilePath;
  enabled;
  dirty = false;
  writeTimer = null;
  cleanupTimer = null;
  stats = {
    memoryHits: 0,
    diskHits: 0,
    misses: 0,
    writes: 0
  };
  constructor(config) {
    this.enabled = config.enabled;
    this.memoryTtlMs = config.memory_ttl_seconds * 1000;
    this.diskTtlMs = config.disk_ttl_seconds * 1000;
    this.writeIntervalMs = config.write_interval_seconds * 1000;
    this.cacheFilePath = getCacheFilePath();
    if (this.enabled) {
      this.loadFromDisk();
      this.startBackgroundTasks();
    }
  }
  static makeKey(sessionId, modelId) {
    return `${sessionId}:${modelId}`;
  }
  store(key, signature) {
    if (!this.enabled)
      return;
    this.cache.set(key, {
      value: signature,
      timestamp: Date.now()
    });
    this.dirty = true;
  }
  retrieve(key) {
    if (!this.enabled)
      return null;
    const entry = this.cache.get(key);
    if (entry) {
      const age = Date.now() - entry.timestamp;
      if (age <= this.memoryTtlMs) {
        this.stats.memoryHits++;
        return entry.value;
      }
      this.cache.delete(key);
    }
    this.stats.misses++;
    return null;
  }
  has(key) {
    if (!this.enabled)
      return false;
    const entry = this.cache.get(key);
    if (!entry)
      return false;
    const age = Date.now() - entry.timestamp;
    return age <= this.memoryTtlMs;
  }
  storeThinking(key, thinkingText, signature, toolIds) {
    if (!this.enabled || !thinkingText || !signature)
      return;
    this.cache.set(key, {
      value: signature,
      timestamp: Date.now(),
      thinkingText,
      textPreview: thinkingText.slice(0, 100),
      toolIds
    });
    this.dirty = true;
  }
  retrieveThinking(key) {
    if (!this.enabled)
      return null;
    const entry = this.cache.get(key);
    if (!entry || !entry.thinkingText)
      return null;
    const age = Date.now() - entry.timestamp;
    if (age > this.memoryTtlMs) {
      this.cache.delete(key);
      return null;
    }
    this.stats.memoryHits++;
    return {
      text: entry.thinkingText,
      signature: entry.value,
      toolIds: entry.toolIds
    };
  }
  hasThinking(key) {
    if (!this.enabled)
      return false;
    const entry = this.cache.get(key);
    if (!entry || !entry.thinkingText)
      return false;
    const age = Date.now() - entry.timestamp;
    return age <= this.memoryTtlMs;
  }
  getStats() {
    return {
      ...this.stats,
      memoryEntries: this.cache.size,
      dirty: this.dirty,
      diskEnabled: this.enabled
    };
  }
  async flush() {
    if (!this.enabled)
      return true;
    return this.saveToDisk();
  }
  shutdown() {
    if (this.writeTimer) {
      clearInterval(this.writeTimer);
      this.writeTimer = null;
    }
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    if (this.dirty && this.enabled) {
      this.saveToDisk();
    }
  }
  loadFromDisk() {
    try {
      if (!existsSync2(this.cacheFilePath)) {
        return;
      }
      const content = readFileSync2(this.cacheFilePath, "utf-8");
      const data = JSON.parse(content);
      if (data.version !== "1.0") {
        return;
      }
      const now = Date.now();
      let loaded = 0;
      let expired = 0;
      for (const [key, entry] of Object.entries(data.entries)) {
        const age = now - entry.timestamp;
        if (age <= this.diskTtlMs) {
          this.cache.set(key, {
            value: entry.value,
            timestamp: entry.timestamp
          });
          loaded++;
        } else {
          expired++;
        }
      }
    } catch {}
  }
  saveToDisk() {
    try {
      const dir = dirname2(this.cacheFilePath);
      if (!existsSync2(dir)) {
        mkdirSync3(dir, { recursive: true });
      }
      ensureGitignoreSync(dir);
      const now = Date.now();
      let existingEntries = {};
      if (existsSync2(this.cacheFilePath)) {
        try {
          const content = readFileSync2(this.cacheFilePath, "utf-8");
          const data = JSON.parse(content);
          existingEntries = data.entries || {};
        } catch {}
      }
      const validDiskEntries = {};
      for (const [key, entry] of Object.entries(existingEntries)) {
        const age = now - entry.timestamp;
        if (age <= this.diskTtlMs) {
          validDiskEntries[key] = entry;
        }
      }
      const mergedEntries = { ...validDiskEntries };
      for (const [key, entry] of this.cache.entries()) {
        mergedEntries[key] = {
          value: entry.value,
          timestamp: entry.timestamp
        };
      }
      const cacheData = {
        version: "1.0",
        memory_ttl_seconds: this.memoryTtlMs / 1000,
        disk_ttl_seconds: this.diskTtlMs / 1000,
        entries: mergedEntries,
        statistics: {
          memory_hits: this.stats.memoryHits,
          disk_hits: this.stats.diskHits,
          misses: this.stats.misses,
          writes: this.stats.writes + 1,
          last_write: now
        }
      };
      const tmpPath = join3(tmpdir(), `antigravity-cache-${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`);
      writeFileSync2(tmpPath, JSON.stringify(cacheData, null, 2), "utf-8");
      try {
        renameSync2(tmpPath, this.cacheFilePath);
      } catch {
        writeFileSync2(this.cacheFilePath, readFileSync2(tmpPath));
        try {
          unlinkSync3(tmpPath);
        } catch {}
      }
      this.stats.writes++;
      this.dirty = false;
      return true;
    } catch {
      return false;
    }
  }
  startBackgroundTasks() {
    this.writeTimer = setInterval(() => {
      if (this.dirty) {
        this.saveToDisk();
      }
    }, this.writeIntervalMs);
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpired();
    }, 30 * 60 * 1000);
  }
  cleanupExpired() {
    const now = Date.now();
    let cleaned = 0;
    for (const [key, entry] of this.cache.entries()) {
      const age = now - entry.timestamp;
      if (age > this.memoryTtlMs) {
        this.cache.delete(key);
        cleaned++;
      }
    }
  }
}

var authCache = new Map;
var signatureCache = new Map;
var SIGNATURE_CACHE_TTL_MS = 60 * 60 * 1000;

var log3 = createLogger("token");

function getModelFamily(model) {
  const lower = model.toLowerCase();
  if (lower.includes("claude")) {
    return "claude";
  }
  if (lower.includes("flash")) {
    return "gemini-flash";
  }
  return "gemini-pro";
}

var FETCH_TIMEOUT_MS = 1e4;
async function fetchWithTimeout(url, options, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}
async function fetchAvailableModels(accessToken, projectId) {
  const endpoint = ANTIGRAVITY_ENDPOINT_PROD;
  const quotaUserAgent = getAntigravityHeaders()["User-Agent"] || "antigravity/windows/amd64";
  const errors = [];
  const body = projectId ? { project: projectId } : {};
  const response = await fetchWithTimeout(`${endpoint}/v1internal:fetchAvailableModels`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "User-Agent": quotaUserAgent
    },
    body: JSON.stringify(body)
  });
  if (response.ok) {
    return await response.json();
  }
  const message = await response.text().catch(() => "");
  const snippet = message.trim().slice(0, 200);
  errors.push(`fetchAvailableModels ${response.status} at ${endpoint}${snippet ? `: ${snippet}` : ""}`);
  throw new Error(errors.join("; ") || "fetchAvailableModels failed");
}

var DEFAULT_HEALTH_SCORE_CONFIG = {
  initial: 70,
  successReward: 1,
  rateLimitPenalty: -10,
  failurePenalty: -20,
  recoveryRatePerHour: 2,
  minUsable: 50,
  maxScore: 100
};

class HealthScoreTracker {
  scores = new Map;
  config;
  constructor(config = {}) {
    this.config = { ...DEFAULT_HEALTH_SCORE_CONFIG, ...config };
  }
  getScore(accountIndex) {
    const state = this.scores.get(accountIndex);
    if (!state) {
      return this.config.initial;
    }
    const now = Date.now();
    const hoursSinceUpdate = (now - state.lastUpdated) / (1000 * 60 * 60);
    const recoveredPoints = Math.floor(hoursSinceUpdate * this.config.recoveryRatePerHour);
    return Math.min(this.config.maxScore, state.score + recoveredPoints);
  }
  recordSuccess(accountIndex) {
    const now = Date.now();
    const current = this.getScore(accountIndex);
    this.scores.set(accountIndex, {
      score: Math.min(this.config.maxScore, current + this.config.successReward),
      lastUpdated: now,
      lastSuccess: now,
      consecutiveFailures: 0
    });
  }
  recordRateLimit(accountIndex) {
    const now = Date.now();
    const state = this.scores.get(accountIndex);
    const current = this.getScore(accountIndex);
    this.scores.set(accountIndex, {
      score: Math.max(0, current + this.config.rateLimitPenalty),
      lastUpdated: now,
      lastSuccess: state?.lastSuccess ?? 0,
      consecutiveFailures: (state?.consecutiveFailures ?? 0) + 1
    });
  }
  recordFailure(accountIndex) {
    const now = Date.now();
    const state = this.scores.get(accountIndex);
    const current = this.getScore(accountIndex);
    this.scores.set(accountIndex, {
      score: Math.max(0, current + this.config.failurePenalty),
      lastUpdated: now,
      lastSuccess: state?.lastSuccess ?? 0,
      consecutiveFailures: (state?.consecutiveFailures ?? 0) + 1
    });
  }
  isUsable(accountIndex) {
    return this.getScore(accountIndex) >= this.config.minUsable;
  }
  getConsecutiveFailures(accountIndex) {
    return this.scores.get(accountIndex)?.consecutiveFailures ?? 0;
  }
  reset(accountIndex) {
    this.scores.delete(accountIndex);
  }
  getSnapshot() {
    const result = new Map;
    for (const [index] of this.scores) {
      result.set(index, {
        score: this.getScore(index),
        consecutiveFailures: this.getConsecutiveFailures(index)
      });
    }
    return result;
  }
}
var STICKINESS_BONUS = 150;
var SWITCH_THRESHOLD = 100;
function selectHybridAccount(accounts, tokenTracker, currentAccountIndex = null, minHealthScore = 50) {
  const candidates = accounts.filter((acc) => !getLeaseTracker().isLeased(acc.index) && !acc.isRateLimited && !acc.isCoolingDown && acc.healthScore >= minHealthScore && tokenTracker.hasTokens(acc.index)).map((acc) => ({
    ...acc,
    tokens: tokenTracker.getTokens(acc.index)
  }));
  if (candidates.length === 0) {
    return null;
  }
  const maxTokens = tokenTracker.getMaxTokens();
  const scored = candidates.map((acc) => {
    const baseScore = calculateHybridScore(acc, maxTokens);
    const stickinessBonus = acc.index === currentAccountIndex ? STICKINESS_BONUS : 0;
    return {
      index: acc.index,
      baseScore,
      score: baseScore + stickinessBonus,
      isCurrent: acc.index === currentAccountIndex
    };
  }).sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (!best) {
    return null;
  }
  const currentCandidate = scored.find((s) => s.isCurrent);
  if (currentCandidate && !best.isCurrent) {
    const advantage = best.baseScore - currentCandidate.baseScore;
    if (advantage < SWITCH_THRESHOLD) {
      return currentCandidate.index;
    }
  }
  return best.index;
}
function calculateHybridScore(account, maxTokens) {
  const healthComponent = account.healthScore * 2;
  const tokenComponent = account.tokens / maxTokens * 100 * 5;
  const secondsSinceUsed = (Date.now() - account.lastUsed) / 1000;
  const freshnessComponent = Math.min(secondsSinceUsed, 3600) * 0.1;
  return Math.max(0, healthComponent + tokenComponent + freshnessComponent);
}
var DEFAULT_TOKEN_BUCKET_CONFIG = {
  maxTokens: 50,
  regenerationRatePerMinute: 6,
  initialTokens: 50
};

class TokenBucketTracker {
  buckets = new Map;
  config;
  constructor(config = {}) {
    this.config = { ...DEFAULT_TOKEN_BUCKET_CONFIG, ...config };
  }
  getTokens(accountIndex) {
    const state = this.buckets.get(accountIndex);
    if (!state) {
      return this.config.initialTokens;
    }
    const now = Date.now();
    const minutesSinceUpdate = (now - state.lastUpdated) / (1000 * 60);
    const recoveredTokens = minutesSinceUpdate * this.config.regenerationRatePerMinute;
    return Math.min(this.config.maxTokens, state.tokens + recoveredTokens);
  }
  hasTokens(accountIndex, cost = 1) {
    return this.getTokens(accountIndex) >= cost;
  }
  consume(accountIndex, cost = 1) {
    const current = this.getTokens(accountIndex);
    if (current < cost) {
      return false;
    }
    this.buckets.set(accountIndex, {
      tokens: current - cost,
      lastUpdated: Date.now()
    });
    return true;
  }
  refund(accountIndex, amount = 1) {
    const current = this.getTokens(accountIndex);
    this.buckets.set(accountIndex, {
      tokens: Math.min(this.config.maxTokens, current + amount),
      lastUpdated: Date.now()
    });
  }
  getMaxTokens() {
    return this.config.maxTokens;
  }
}
var globalTokenTracker = null;
function getTokenTracker() {
  if (!globalTokenTracker) {
    globalTokenTracker = new TokenBucketTracker;
  }
  return globalTokenTracker;
}
var globalHealthTracker = null;
function getHealthTracker() {
  if (!globalHealthTracker) {
    globalHealthTracker = new HealthScoreTracker;
  }
  return globalHealthTracker;
}
class LeaseTracker {
  leasedAccounts = new Set;
  lease(accountIndex) {
    this.leasedAccounts.add(accountIndex);
  }
  release(accountIndex) {
    this.leasedAccounts.delete(accountIndex);
  }
  isLeased(accountIndex) {
    return this.leasedAccounts.has(accountIndex);
  }
}

class ProxyManager {
  proxyCooldowns = new Map;
  markCooldown(proxy, cooldownMs = 60000) {
    this.proxyCooldowns.set(proxy, Date.now() + cooldownMs);
  }
  isCoolingDown(proxy) {
    const expiresAt = this.proxyCooldowns.get(proxy);
    if (!expiresAt)
      return false;
    if (Date.now() > expiresAt) {
      this.proxyCooldowns.delete(proxy);
      return false;
    }
    return true;
  }
  selectBestProxy(proxies) {
    if (!proxies || proxies.length === 0)
      return;
    const available = proxies.filter((p) => !this.isCoolingDown(p));
    if (available.length === 0)
      return proxies[Math.floor(Math.random() * proxies.length)];
    return available[Math.floor(Math.random() * available.length)];
  }
}
var globalLeaseTracker = null;
function getLeaseTracker() {
  if (!globalLeaseTracker)
    globalLeaseTracker = new LeaseTracker;
  return globalLeaseTracker;
}

import * as crypto from "crypto";
var OS_VERSIONS = {
  darwin: ["10.15.7", "11.6.8", "12.6.3", "13.5.2", "14.2.1", "14.5"],
  win32: ["10.0.19041", "10.0.19042", "10.0.19043", "10.0.22000", "10.0.22621", "10.0.22631"],
  linux: ["5.15.0", "5.19.0", "6.1.0", "6.2.0", "6.5.0", "6.6.0"]
};
var ARCHITECTURES = ["x64", "arm64"];
var IDE_TYPES = [
  "ANTIGRAVITY"
];
var SDK_CLIENTS = [
  "google-cloud-sdk vscode_cloudshelleditor/0.1",
  "google-cloud-sdk vscode/1.86.0",
  "google-cloud-sdk vscode/1.87.0",
  "google-cloud-sdk vscode/1.96.0"
];
var MAX_FINGERPRINT_HISTORY = 5;
var PLATFORM_CHOICES = ["darwin", "win32"];
function randomFrom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
function platformToDisplayName(platform) {
  return platform === "win32" ? "WINDOWS" : "MACOS";
}
function generateDeviceId() {
  return crypto.randomUUID();
}
function generateSessionToken() {
  return crypto.randomBytes(16).toString("hex");
}
function generateFingerprint() {
  const platform = randomFrom(PLATFORM_CHOICES);
  const arch = randomFrom(ARCHITECTURES);
  const osVersion = randomFrom(OS_VERSIONS[platform] ?? OS_VERSIONS.darwin);
  return {
    deviceId: generateDeviceId(),
    sessionToken: generateSessionToken(),
    userAgent: `antigravity/${getAntigravityVersion()} ${platform}/${arch}`,
    apiClient: randomFrom(SDK_CLIENTS),
    clientMetadata: {
      ideType: randomFrom(IDE_TYPES),
      platform: platformToDisplayName(platform),
      pluginType: "GEMINI"
    },
    createdAt: Date.now()
  };
}
function updateFingerprintVersion(fingerprint) {
  const currentVersion = getAntigravityVersion();
  const versionPattern = /^(antigravity\/)([\d.]+)/;
  const match = fingerprint.userAgent.match(versionPattern);
  if (!match || match[2] === currentVersion) {
    return false;
  }
  fingerprint.userAgent = fingerprint.userAgent.replace(versionPattern, `$1${currentVersion}`);
  return true;
}

var QUOTA_EXHAUSTED_BACKOFFS = [60000, 300000, 1800000, 7200000];
var MODEL_CAPACITY_EXHAUSTED_BASE_BACKOFF = 45000;
var MODEL_CAPACITY_EXHAUSTED_JITTER_MAX = 30000;
var UNKNOWN_BACKOFF = 60000;
var MIN_BACKOFF_MS = 2000;
function generateJitter(maxJitterMs) {
  return Math.random() * maxJitterMs - maxJitterMs / 2;
}
function calculateBackoffMs(reason, consecutiveFailures, retryAfterMs) {
  if (retryAfterMs && retryAfterMs > 0) {
    return Math.max(retryAfterMs, MIN_BACKOFF_MS);
  }
  let baseBackoff = UNKNOWN_BACKOFF;
  switch (reason) {
    case "QUOTA_EXHAUSTED": {
      const index = Math.min(consecutiveFailures, QUOTA_EXHAUSTED_BACKOFFS.length - 1);
      return QUOTA_EXHAUSTED_BACKOFFS[index] ?? UNKNOWN_BACKOFF;
    }
    case "RATE_LIMIT_EXCEEDED":
      baseBackoff = 45000;
      break;
    case "MODEL_CAPACITY_EXHAUSTED":
      baseBackoff = MODEL_CAPACITY_EXHAUSTED_BASE_BACKOFF + generateJitter(MODEL_CAPACITY_EXHAUSTED_JITTER_MAX);
      break;
    case "SERVER_ERROR":
      baseBackoff = 30000;
      break;
    case "UNKNOWN":
    default:
      baseBackoff = 90000;
      break;
  }
  const MAX_EXPONENTIAL_BACKOFF = 60 * 60 * 1000;
  const multiplier = Math.pow(1.5, consecutiveFailures);
  return Math.min(Math.round(baseBackoff * multiplier), MAX_EXPONENTIAL_BACKOFF);
}
function nowMs() {
  return Date.now();
}
function clampNonNegativeInt(value, fallback) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return value < 0 ? 0 : Math.floor(value);
}
function getQuotaKey(family, headerStyle, model) {
  if (family === "claude") {
    return "claude";
  }
  const base = headerStyle === "gemini-cli" ? "gemini-cli" : "gemini-antigravity";
  if (model) {
    return `${base}:${model}`;
  }
  return base;
}
function isRateLimitedForQuotaKey(account, key) {
  const resetTime = account.rateLimitResetTimes[key];
  return resetTime !== undefined && nowMs() < resetTime;
}
function isRateLimitedForFamily(account, family, model) {
  if (family === "claude") {
    return isRateLimitedForQuotaKey(account, "claude");
  }
  const antigravityIsLimited = isRateLimitedForHeaderStyle(account, family, "antigravity", model);
  const cliIsLimited = isRateLimitedForHeaderStyle(account, family, "gemini-cli", model);
  return antigravityIsLimited && cliIsLimited;
}
function isRateLimitedForHeaderStyle(account, family, headerStyle, model) {
  clearExpiredRateLimits(account);
  if (family === "claude") {
    return isRateLimitedForQuotaKey(account, "claude");
  }
  if (model) {
    const modelKey = getQuotaKey(family, headerStyle, model);
    if (isRateLimitedForQuotaKey(account, modelKey)) {
      return true;
    }
  }
  const baseKey = getQuotaKey(family, headerStyle);
  return isRateLimitedForQuotaKey(account, baseKey);
}
function clearExpiredRateLimits(account) {
  const now = nowMs();
  const keys = Object.keys(account.rateLimitResetTimes);
  for (const key of keys) {
    const resetTime = account.rateLimitResetTimes[key];
    if (resetTime !== undefined && now >= resetTime) {
      delete account.rateLimitResetTimes[key];
    }
  }
}
function resolveQuotaGroup(family, model) {
  if (model) {
    return getModelFamily(model);
  }
  return family === "claude" ? "claude" : "gemini-pro";
}
function isOverSoftQuotaThreshold(account, family, thresholdPercent, cacheTtlMs, model) {
  if (thresholdPercent >= 100)
    return false;
  if (!account.cachedQuota)
    return false;
  if (account.cachedQuotaUpdatedAt == null)
    return false;
  const age = nowMs() - account.cachedQuotaUpdatedAt;
  if (age > cacheTtlMs)
    return false;
  const quotaGroup = resolveQuotaGroup(family, model);
  const groupData = account.cachedQuota[quotaGroup];
  if (groupData?.remainingFraction == null)
    return false;
  const remainingFraction = Math.max(0, Math.min(1, groupData.remainingFraction));
  const usedPercent = (1 - remainingFraction) * 100;
  const isOverThreshold = usedPercent >= thresholdPercent;
  if (isOverThreshold) {
    const accountLabel = formatAccountLabel(account.email, account.index);
    const resetSuffix = groupData.resetTime ? ` (resets: ${groupData.resetTime})` : "";
    const message = `[SoftQuota] Skipping ${accountLabel}: ${quotaGroup} usage ${usedPercent.toFixed(1)}% >= threshold ${thresholdPercent}%${resetSuffix}`;
    debugLogToFile(message);
  }
  return isOverThreshold;
}
class AccountManager {
  accounts = [];
  cursor = 0;
  currentAccountIndexByFamily = {
    claude: -1,
    gemini: -1
  };
  sessionOffsetApplied = {
    claude: false,
    gemini: false
  };
  lastToastAccountIndex = -1;
  lastToastTime = 0;
  savePending = false;
  saveTimeout = null;
  savePromiseResolvers = [];
  static async loadFromDisk(authFallback) {
    const stored = await loadAccounts();
    return new AccountManager(authFallback, stored);
  }
  constructor(authFallback, stored) {
    const authParts = authFallback ? parseRefreshParts(authFallback.refresh) : null;
    if (stored && stored.accounts.length === 0) {
      this.accounts = [];
      this.cursor = 0;
      return;
    }
    if (stored && stored.accounts.length > 0) {
      const baseNow = nowMs();
      this.accounts = stored.accounts.map((acc, index) => {
        if (!acc.refreshToken || typeof acc.refreshToken !== "string") {
          return null;
        }
        const matchesFallback = !!(authFallback && authParts && authParts.refreshToken && acc.refreshToken === authParts.refreshToken);
        return {
          index,
          email: acc.email,
          proxies: acc.proxies,
          addedAt: clampNonNegativeInt(acc.addedAt, baseNow),
          lastUsed: clampNonNegativeInt(acc.lastUsed, 0),
          parts: {
            refreshToken: acc.refreshToken,
            projectId: acc.projectId,
            managedProjectId: acc.managedProjectId
          },
          access: matchesFallback ? authFallback?.access : undefined,
          expires: matchesFallback ? authFallback?.expires : undefined,
          enabled: acc.enabled !== false,
          rateLimitResetTimes: acc.rateLimitResetTimes ?? {},
          lastSwitchReason: acc.lastSwitchReason,
          coolingDownUntil: acc.coolingDownUntil,
          cooldownReason: acc.cooldownReason,
          touchedForQuota: {},
          fingerprint: acc.fingerprint ?? generateFingerprint(),
          fingerprintHistory: acc.fingerprintHistory ?? [],
          cachedQuota: acc.cachedQuota,
          cachedQuotaUpdatedAt: acc.cachedQuotaUpdatedAt,
          verificationRequired: acc.verificationRequired,
          verificationRequiredAt: acc.verificationRequiredAt,
          verificationRequiredReason: acc.verificationRequiredReason,
          verificationUrl: acc.verificationUrl
        };
      }).filter((a) => a !== null);
      let fingerprintVersionChanged = false;
      for (const acc of this.accounts) {
        if (acc.fingerprint && updateFingerprintVersion(acc.fingerprint)) {
          fingerprintVersionChanged = true;
        }
      }
      this.cursor = clampNonNegativeInt(stored.activeIndex, 0);
      if (this.accounts.length > 0) {
        this.cursor = this.cursor % this.accounts.length;
        const defaultIndex = this.cursor;
        this.currentAccountIndexByFamily.claude = clampNonNegativeInt(stored.activeIndexByFamily?.claude, defaultIndex) % this.accounts.length;
        this.currentAccountIndexByFamily.gemini = clampNonNegativeInt(stored.activeIndexByFamily?.gemini, defaultIndex) % this.accounts.length;
      }
      if (fingerprintVersionChanged) {
        this.requestSaveToDisk();
      }
      return;
    }
    if (authFallback && this.accounts.length > 0) {
      const authParts2 = parseRefreshParts(authFallback.refresh);
      const hasMatching = this.accounts.some((acc) => acc.parts.refreshToken === authParts2.refreshToken);
      if (!hasMatching && authParts2.refreshToken) {
        const now = nowMs();
        const newAccount = {
          index: this.accounts.length,
          email: undefined,
          addedAt: now,
          lastUsed: 0,
          parts: authParts2,
          access: authFallback.access,
          expires: authFallback.expires,
          enabled: true,
          rateLimitResetTimes: {},
          touchedForQuota: {}
        };
        this.accounts.push(newAccount);
        this.currentAccountIndexByFamily.claude = Math.min(this.currentAccountIndexByFamily.claude, this.accounts.length - 1);
        this.currentAccountIndexByFamily.gemini = Math.min(this.currentAccountIndexByFamily.gemini, this.accounts.length - 1);
      }
    }
    if (authFallback) {
      const parts = parseRefreshParts(authFallback.refresh);
      if (parts.refreshToken) {
        const now = nowMs();
        this.accounts = [
          {
            index: 0,
            email: undefined,
            addedAt: now,
            lastUsed: 0,
            parts,
            access: authFallback.access,
            expires: authFallback.expires,
            enabled: true,
            rateLimitResetTimes: {},
            touchedForQuota: {}
          }
        ];
        this.cursor = 0;
        this.currentAccountIndexByFamily.claude = 0;
        this.currentAccountIndexByFamily.gemini = 0;
      }
    }
  }
  getAccountCount() {
    return this.getEnabledAccounts().length;
  }
  getTotalAccountCount() {
    return this.accounts.length;
  }
  getEnabledAccounts() {
    return this.accounts.filter((account) => account.enabled !== false);
  }
  getAccountsSnapshot() {
    return this.accounts.map((a) => ({ ...a, parts: { ...a.parts }, rateLimitResetTimes: { ...a.rateLimitResetTimes } }));
  }
  getCurrentAccountForFamily(family) {
    const currentIndex = this.currentAccountIndexByFamily[family];
    if (currentIndex >= 0 && currentIndex < this.accounts.length) {
      const account = this.accounts[currentIndex] ?? null;
      if (account && account.enabled !== false) {
        return account;
      }
    }
    return null;
  }
  markSwitched(account, reason, family) {
    account.lastSwitchReason = reason;
    this.currentAccountIndexByFamily[family] = account.index;
  }
  shouldShowAccountToast(accountIndex, debounceMs = 30000) {
    const now = nowMs();
    if (accountIndex !== this.lastToastAccountIndex) {
      return true;
    }
    return now - this.lastToastTime >= debounceMs;
  }
  markToastShown(accountIndex) {
    this.lastToastAccountIndex = accountIndex;
    this.lastToastTime = nowMs();
  }
  getCurrentOrNextForFamily(family, model, strategy = "sticky", headerStyle = "antigravity", pidOffsetEnabled = false, softQuotaThresholdPercent = 100, softQuotaCacheTtlMs = 10 * 60 * 1000) {
    const quotaKey = getQuotaKey(family, headerStyle, model);
    if (strategy === "round-robin") {
      const next2 = this.getNextForFamily(family, model, headerStyle, softQuotaThresholdPercent, softQuotaCacheTtlMs);
      if (next2) {
        this.markTouchedForQuota(next2, quotaKey);
        this.currentAccountIndexByFamily[family] = next2.index;
      }
      return next2;
    }
    if (strategy === "hybrid") {
      const healthTracker = getHealthTracker();
      const tokenTracker = getTokenTracker();
      const accountsWithMetrics = this.accounts.filter((acc) => acc.enabled !== false).map((acc) => {
        clearExpiredRateLimits(acc);
        return {
          index: acc.index,
          lastUsed: acc.lastUsed,
          healthScore: healthTracker.getScore(acc.index),
          isRateLimited: isRateLimitedForFamily(acc, family, model) || isOverSoftQuotaThreshold(acc, family, softQuotaThresholdPercent, softQuotaCacheTtlMs, model),
          isCoolingDown: this.isAccountCoolingDown(acc)
        };
      });
      const currentIndex = this.currentAccountIndexByFamily[family] ?? null;
      const selectedIndex = selectHybridAccount(accountsWithMetrics, tokenTracker, currentIndex);
      if (selectedIndex !== null) {
        const selected = this.accounts[selectedIndex];
        if (selected) {
          selected.lastUsed = nowMs();
          this.markTouchedForQuota(selected, quotaKey);
          this.currentAccountIndexByFamily[family] = selected.index;
          return selected;
        }
      }
    }
    if (pidOffsetEnabled && !this.sessionOffsetApplied[family] && this.accounts.length > 1) {
      const pidOffset = process.pid % this.accounts.length;
      const baseIndex = this.currentAccountIndexByFamily[family] ?? 0;
      const newIndex = (baseIndex + pidOffset) % this.accounts.length;
      debugLogToFile(`[Account] Applying PID offset: pid=${process.pid} offset=${pidOffset} family=${family} index=${baseIndex}->${newIndex}`);
      this.currentAccountIndexByFamily[family] = newIndex;
      this.sessionOffsetApplied[family] = true;
    }
    const current = this.getCurrentAccountForFamily(family);
    if (current) {
      clearExpiredRateLimits(current);
      const isLimitedForRequestedStyle = isRateLimitedForHeaderStyle(current, family, headerStyle, model);
      const isOverThreshold = isOverSoftQuotaThreshold(current, family, softQuotaThresholdPercent, softQuotaCacheTtlMs, model);
      if (!isLimitedForRequestedStyle && !isOverThreshold && !this.isAccountCoolingDown(current)) {
        this.markTouchedForQuota(current, quotaKey);
        return current;
      }
    }
    const next = this.getNextForFamily(family, model, headerStyle, softQuotaThresholdPercent, softQuotaCacheTtlMs);
    if (next) {
      this.markTouchedForQuota(next, quotaKey);
      this.currentAccountIndexByFamily[family] = next.index;
    }
    return next;
  }
  getNextForFamily(family, model, headerStyle = "antigravity", softQuotaThresholdPercent = 100, softQuotaCacheTtlMs = 10 * 60 * 1000) {
    const available = this.accounts.filter((a) => {
      clearExpiredRateLimits(a);
      return a.enabled !== false && !isRateLimitedForHeaderStyle(a, family, headerStyle, model) && !isOverSoftQuotaThreshold(a, family, softQuotaThresholdPercent, softQuotaCacheTtlMs, model) && !this.isAccountCoolingDown(a);
    });
    if (available.length === 0) {
      return null;
    }
    const account = available[this.cursor % available.length];
    if (!account) {
      return null;
    }
    this.cursor++;
    return account;
  }
  markRateLimited(account, retryAfterMs, family, headerStyle = "antigravity", model) {
    const key = getQuotaKey(family, headerStyle, model);
    account.rateLimitResetTimes[key] = nowMs() + retryAfterMs;
  }
  markAccountUsed(accountIndex) {
    const account = this.accounts.find((a) => a.index === accountIndex);
    if (account) {
      account.lastUsed = nowMs();
    }
  }
  markRateLimitedWithReason(account, family, headerStyle, model, reason = "UNKNOWN", retryAfterMs, ttlMs) {
    const now = nowMs();
    const failures = (account.consecutiveFailures ?? 0) + 1;
    account.consecutiveFailures = failures;
    account.lastFailureTime = now;
    const smartBackoffMs = calculateBackoffMs(reason, failures - 1, retryAfterMs);
    const baseRetryMs = retryAfterMs && retryAfterMs > 0 ? Math.max(retryAfterMs, MIN_BACKOFF_MS) : 0;
    const backoffMs = Math.max(smartBackoffMs, baseRetryMs * Math.pow(1.5, failures - 1));
    const key = getQuotaKey(family, headerStyle, model);
    account.rateLimitResetTimes[key] = now + backoffMs;
    return backoffMs;
  }
  markRequestSuccess(account) {
    if (account.consecutiveFailures) {
      account.consecutiveFailures = 0;
    }
  }
  clearAllRateLimitsForFamily(family, model) {
    for (const account of this.accounts) {
      if (family === "claude") {
        delete account.rateLimitResetTimes.claude;
      } else {
        const antigravityKey = getQuotaKey(family, "antigravity", model);
        const cliKey = getQuotaKey(family, "gemini-cli", model);
        delete account.rateLimitResetTimes[antigravityKey];
        delete account.rateLimitResetTimes[cliKey];
      }
      account.consecutiveFailures = 0;
    }
  }
  shouldTryOptimisticReset(family, model) {
    const minWaitMs = this.getMinWaitTimeForFamily(family, model);
    return minWaitMs > 0 && minWaitMs <= 2000;
  }
  markAccountCoolingDown(account, cooldownMs, reason) {
    account.coolingDownUntil = nowMs() + cooldownMs;
    account.cooldownReason = reason;
  }
  isAccountCoolingDown(account) {
    if (account.coolingDownUntil === undefined) {
      return false;
    }
    if (nowMs() >= account.coolingDownUntil) {
      this.clearAccountCooldown(account);
      return false;
    }
    return true;
  }
  clearAccountCooldown(account) {
    delete account.coolingDownUntil;
    delete account.cooldownReason;
  }
  getAccountCooldownReason(account) {
    return this.isAccountCoolingDown(account) ? account.cooldownReason : undefined;
  }
  markTouchedForQuota(account, quotaKey) {
    account.touchedForQuota[quotaKey] = nowMs();
  }
  isFreshForQuota(account, quotaKey) {
    const touchedAt = account.touchedForQuota[quotaKey];
    if (!touchedAt)
      return true;
    const resetTime = account.rateLimitResetTimes[quotaKey];
    if (resetTime && touchedAt < resetTime)
      return true;
    return false;
  }
  getFreshAccountsForQuota(quotaKey, family, model) {
    return this.accounts.filter((acc) => {
      clearExpiredRateLimits(acc);
      return acc.enabled !== false && this.isFreshForQuota(acc, quotaKey) && !isRateLimitedForFamily(acc, family, model) && !this.isAccountCoolingDown(acc);
    });
  }
  isRateLimitedForHeaderStyle(account, family, headerStyle, model) {
    return isRateLimitedForHeaderStyle(account, family, headerStyle, model);
  }
  getAvailableHeaderStyle(account, family, model) {
    clearExpiredRateLimits(account);
    if (family === "claude") {
      return isRateLimitedForHeaderStyle(account, family, "antigravity") ? null : "antigravity";
    }
    if (!isRateLimitedForHeaderStyle(account, family, "antigravity", model)) {
      return "antigravity";
    }
    if (!isRateLimitedForHeaderStyle(account, family, "gemini-cli", model)) {
      return "gemini-cli";
    }
    return null;
  }
  hasOtherAccountWithAntigravityAvailable(currentAccountIndex, family, model) {
    if (family === "claude") {
      return false;
    }
    return this.accounts.some((acc) => {
      if (acc.index === currentAccountIndex) {
        return false;
      }
      if (acc.enabled === false) {
        return false;
      }
      if (this.isAccountCoolingDown(acc)) {
        return false;
      }
      clearExpiredRateLimits(acc);
      return !isRateLimitedForHeaderStyle(acc, family, "antigravity", model);
    });
  }
  setAccountEnabled(accountIndex, enabled) {
    const account = this.accounts[accountIndex];
    if (!account) {
      return false;
    }
    account.enabled = enabled;
    if (!enabled) {
      for (const family of Object.keys(this.currentAccountIndexByFamily)) {
        if (this.currentAccountIndexByFamily[family] === accountIndex) {
          const next = this.accounts.find((a, i) => i !== accountIndex && a.enabled !== false);
          this.currentAccountIndexByFamily[family] = next?.index ?? -1;
        }
      }
    }
    this.requestSaveToDisk();
    return true;
  }
  markAccountVerificationRequired(accountIndex, reason, verifyUrl) {
    const account = this.accounts[accountIndex];
    if (!account) {
      return false;
    }
    account.verificationRequired = true;
    account.verificationRequiredAt = nowMs();
    account.verificationRequiredReason = reason?.trim() || undefined;
    const normalizedVerifyUrl = verifyUrl?.trim();
    if (normalizedVerifyUrl) {
      account.verificationUrl = normalizedVerifyUrl;
    }
    if (account.enabled !== false) {
      this.setAccountEnabled(accountIndex, false);
    } else {
      this.requestSaveToDisk();
    }
    return true;
  }
  clearAccountVerificationRequired(accountIndex, enableAccount = false) {
    const account = this.accounts[accountIndex];
    if (!account) {
      return false;
    }
    const wasVerificationRequired = account.verificationRequired === true;
    const hadMetadata = account.verificationRequiredAt !== undefined || account.verificationRequiredReason !== undefined || account.verificationUrl !== undefined;
    account.verificationRequired = false;
    account.verificationRequiredAt = undefined;
    account.verificationRequiredReason = undefined;
    account.verificationUrl = undefined;
    if (enableAccount && wasVerificationRequired && account.enabled === false) {
      this.setAccountEnabled(accountIndex, true);
    } else if (wasVerificationRequired || hadMetadata) {
      this.requestSaveToDisk();
    }
    return true;
  }
  removeAccountByIndex(accountIndex) {
    if (accountIndex < 0 || accountIndex >= this.accounts.length) {
      return false;
    }
    const account = this.accounts[accountIndex];
    if (!account) {
      return false;
    }
    return this.removeAccount(account);
  }
  removeAccount(account) {
    const idx = this.accounts.indexOf(account);
    if (idx < 0) {
      return false;
    }
    this.accounts.splice(idx, 1);
    this.accounts.forEach((acc, index) => {
      acc.index = index;
    });
    if (this.accounts.length === 0) {
      this.cursor = 0;
      this.currentAccountIndexByFamily.claude = -1;
      this.currentAccountIndexByFamily.gemini = -1;
      return true;
    }
    if (this.cursor > idx) {
      this.cursor -= 1;
    }
    this.cursor = this.cursor % this.accounts.length;
    for (const family of ["claude", "gemini"]) {
      if (this.currentAccountIndexByFamily[family] > idx) {
        this.currentAccountIndexByFamily[family] -= 1;
      }
      if (this.currentAccountIndexByFamily[family] >= this.accounts.length) {
        this.currentAccountIndexByFamily[family] = -1;
      }
    }
    return true;
  }
  updateFromAuth(account, auth) {
    const parts = parseRefreshParts(auth.refresh);
    account.parts = {
      ...parts,
      projectId: parts.projectId ?? account.parts.projectId,
      managedProjectId: parts.managedProjectId ?? account.parts.managedProjectId
    };
    account.access = auth.access;
    account.expires = auth.expires;
  }
  toAuthDetails(account) {
    return {
      type: "oauth",
      refresh: formatRefreshParts(account.parts),
      access: account.access,
      expires: account.expires
    };
  }
  getMinWaitTimeForFamily(family, model, headerStyle, strict) {
    const available = this.accounts.filter((a) => {
      clearExpiredRateLimits(a);
      return a.enabled !== false && !this.isAccountCoolingDown(a) && (strict && headerStyle ? !isRateLimitedForHeaderStyle(a, family, headerStyle, model) : !isRateLimitedForFamily(a, family, model));
    });
    if (available.length > 0) {
      return 0;
    }
    const waitTimes = [];
    for (const a of this.accounts) {
      if (a.enabled === false)
        continue;
      const coolWait = a.coolingDownUntil ? Math.max(0, a.coolingDownUntil - nowMs()) : 0;
      let rateWait = Infinity;
      if (family === "claude") {
        const t = a.rateLimitResetTimes.claude;
        if (t !== undefined)
          rateWait = Math.max(0, t - nowMs());
      } else if (strict && headerStyle) {
        const key = getQuotaKey(family, headerStyle, model);
        const t = a.rateLimitResetTimes[key];
        if (t !== undefined)
          rateWait = Math.max(0, t - nowMs());
      } else {
        const antigravityKey = getQuotaKey(family, "antigravity", model);
        const cliKey = getQuotaKey(family, "gemini-cli", model);
        const t1 = a.rateLimitResetTimes[antigravityKey];
        const t2 = a.rateLimitResetTimes[cliKey];
        rateWait = Math.min(t1 !== undefined ? Math.max(0, t1 - nowMs()) : Infinity, t2 !== undefined ? Math.max(0, t2 - nowMs()) : Infinity);
      }
      const totalWait = Math.max(coolWait, rateWait === Infinity ? 0 : rateWait);
      if (totalWait > 0) {
        waitTimes.push(totalWait);
      }
    }
    return waitTimes.length > 0 ? Math.min(...waitTimes) : 0;
  }
  getAccounts() {
    return [...this.accounts];
  }
  async saveToDisk() {
    const claudeIndex = Math.max(0, this.currentAccountIndexByFamily.claude);
    const geminiIndex = Math.max(0, this.currentAccountIndexByFamily.gemini);
    const storage = {
      version: 4,
      accounts: this.accounts.map((a) => ({
        email: a.email,
        proxies: a.proxies,
        refreshToken: a.parts.refreshToken,
        projectId: a.parts.projectId,
        managedProjectId: a.parts.managedProjectId,
        addedAt: a.addedAt,
        lastUsed: a.lastUsed,
        enabled: a.enabled,
        lastSwitchReason: a.lastSwitchReason,
        rateLimitResetTimes: Object.keys(a.rateLimitResetTimes).length > 0 ? a.rateLimitResetTimes : undefined,
        coolingDownUntil: a.coolingDownUntil,
        cooldownReason: a.cooldownReason,
        fingerprint: a.fingerprint,
        fingerprintHistory: a.fingerprintHistory?.length ? a.fingerprintHistory : undefined,
        cachedQuota: a.cachedQuota && Object.keys(a.cachedQuota).length > 0 ? a.cachedQuota : undefined,
        cachedQuotaUpdatedAt: a.cachedQuotaUpdatedAt,
        verificationRequired: a.verificationRequired,
        verificationRequiredAt: a.verificationRequiredAt,
        verificationRequiredReason: a.verificationRequiredReason,
        verificationUrl: a.verificationUrl
      })),
      activeIndex: claudeIndex,
      activeIndexByFamily: {
        claude: claudeIndex,
        gemini: geminiIndex
      }
    };
    await saveAccounts(storage);
  }
  requestSaveToDisk() {
    if (this.savePending) {
      return;
    }
    this.savePending = true;
    this.saveTimeout = setTimeout(() => {
      this.executeSave();
    }, 1000);
  }
  async flushSaveToDisk() {
    if (!this.savePending) {
      return;
    }
    return new Promise((resolve) => {
      this.savePromiseResolvers.push(resolve);
    });
  }
  async executeSave() {
    this.savePending = false;
    this.saveTimeout = null;
    try {
      await this.saveToDisk();
    } catch {} finally {
      const resolvers = this.savePromiseResolvers;
      this.savePromiseResolvers = [];
      for (const resolve of resolvers) {
        resolve();
      }
    }
  }
  regenerateAccountFingerprint(accountIndex) {
    const account = this.accounts[accountIndex];
    if (!account)
      return null;
    if (account.fingerprint) {
      const historyEntry = {
        fingerprint: account.fingerprint,
        timestamp: nowMs(),
        reason: "regenerated"
      };
      if (!account.fingerprintHistory) {
        account.fingerprintHistory = [];
      }
      account.fingerprintHistory.unshift(historyEntry);
      if (account.fingerprintHistory.length > MAX_FINGERPRINT_HISTORY) {
        account.fingerprintHistory = account.fingerprintHistory.slice(0, MAX_FINGERPRINT_HISTORY);
      }
    }
    account.fingerprint = generateFingerprint();
    this.requestSaveToDisk();
    return account.fingerprint;
  }
  restoreAccountFingerprint(accountIndex, historyIndex) {
    const account = this.accounts[accountIndex];
    if (!account)
      return null;
    const history = account.fingerprintHistory;
    if (!history || historyIndex < 0 || historyIndex >= history.length) {
      return null;
    }
    const fingerprintToRestore = history[historyIndex].fingerprint;
    if (account.fingerprint) {
      const historyEntry = {
        fingerprint: account.fingerprint,
        timestamp: nowMs(),
        reason: "restored"
      };
      account.fingerprintHistory.unshift(historyEntry);
      if (account.fingerprintHistory.length > MAX_FINGERPRINT_HISTORY) {
        account.fingerprintHistory = account.fingerprintHistory.slice(0, MAX_FINGERPRINT_HISTORY);
      }
    }
    account.fingerprint = { ...fingerprintToRestore, createdAt: nowMs() };
    this.requestSaveToDisk();
    return account.fingerprint;
  }
  getAccountFingerprintHistory(accountIndex) {
    const account = this.accounts[accountIndex];
    if (!account || !account.fingerprintHistory) {
      return [];
    }
    return [...account.fingerprintHistory];
  }
  updateQuotaCache(accountIndex, quotaGroups) {
    const account = this.accounts[accountIndex];
    if (account) {
      account.cachedQuota = quotaGroups;
      account.cachedQuotaUpdatedAt = nowMs();
    }
  }
  isAccountOverSoftQuota(account, family, thresholdPercent, cacheTtlMs, model) {
    return isOverSoftQuotaThreshold(account, family, thresholdPercent, cacheTtlMs, model);
  }
  getAccountsForQuotaCheck() {
    return this.accounts.map((a) => ({
      email: a.email,
      refreshToken: a.parts.refreshToken,
      projectId: a.parts.projectId,
      managedProjectId: a.parts.managedProjectId,
      addedAt: a.addedAt,
      lastUsed: a.lastUsed,
      enabled: a.enabled
    }));
  }
  getOldestQuotaCacheAge() {
    let oldest = null;
    for (const acc of this.accounts) {
      if (acc.enabled === false)
        continue;
      if (acc.cachedQuotaUpdatedAt == null)
        return null;
      const age = nowMs() - acc.cachedQuotaUpdatedAt;
      if (oldest === null || age > oldest)
        oldest = age;
    }
    return oldest;
  }
  areAllAccountsOverSoftQuota(family, thresholdPercent, cacheTtlMs, model) {
    if (thresholdPercent >= 100)
      return false;
    const enabled = this.accounts.filter((a) => a.enabled !== false);
    if (enabled.length === 0)
      return false;
    return enabled.every((a) => isOverSoftQuotaThreshold(a, family, thresholdPercent, cacheTtlMs, model));
  }
  getMinWaitTimeForSoftQuota(family, thresholdPercent, cacheTtlMs, model) {
    if (thresholdPercent >= 100)
      return 0;
    const enabled = this.accounts.filter((a) => a.enabled !== false);
    if (enabled.length === 0)
      return null;
    const available = enabled.filter((a) => !isOverSoftQuotaThreshold(a, family, thresholdPercent, cacheTtlMs, model));
    if (available.length > 0)
      return 0;
    if (!model && family !== "claude")
      return null;
    const quotaGroup = resolveQuotaGroup(family, model);
    const now = nowMs();
    const waitTimes = [];
    for (const acc of enabled) {
      const groupData = acc.cachedQuota?.[quotaGroup];
      if (groupData?.resetTime) {
        const resetTimestamp = Date.parse(groupData.resetTime);
        if (Number.isFinite(resetTimestamp)) {
          waitTimes.push(Math.max(0, resetTimestamp - now));
        }
      }
    }
    if (waitTimes.length === 0)
      return null;
    const minWait = Math.min(...waitTimes);
    return minWait === 0 ? null : minWait;
  }
}

import { exec } from "child_process";
import os from "os";
var lastNotifiedIndex = -1;
var pendingAlerts = [];
var PORT = 34567;
var HOST = "127.0.0.1";
function liveModelToQuotaModel(model) {
  const normalized = model.replace(/-(minimal|low|medium|high)$/, "");
  if (!normalized.startsWith("antigravity-")) {
    return `antigravity-${normalized}`;
  }
  return normalized;
}
var accountManager;
var currentAccessToken = null;
var currentAccountEmail = null;
var liveModelsCache = [];
var liveModelsLastFetched = 0;
var thoughtSignatureMap = new Map;
var THOUGHT_SIG_TTL = 10 * 60 * 1000;
function storeThoughtSignature(toolId, signature) {
  thoughtSignatureMap.set(toolId, { sig: signature, ts: Date.now() });
  const cutoff = Date.now() - THOUGHT_SIG_TTL;
  for (const [k, v] of thoughtSignatureMap) {
    if (v.ts < cutoff)
      thoughtSignatureMap.delete(k);
  }
}
function recallThoughtSignature(toolId) {
  const entry = thoughtSignatureMap.get(toolId);
  return entry ? entry.sig : null;
}
async function getLiveModels(token, projectId) {
  if (Date.now() - liveModelsLastFetched < 3600 * 1000 && liveModelsCache.length > 0) {
    return liveModelsCache;
  }
  try {
    const res = await fetchAvailableModels(token, projectId);
    if (res.models) {
      liveModelsCache = Object.keys(res.models);
      liveModelsLastFetched = Date.now();
    }
  } catch (e) {
    console.error("Failed to fetch live models", e.message);
  }
  return liveModelsCache;
}
var tokenExpiresAt = 0;
function logDebug2(msg) {
  try {
    fs2.appendFileSync("C:\\\\Users\\\\finn\\\\.claude\\\\proxy-debug.log", `[${new Date().toISOString()}] ${msg}\\n`);
  } catch (e) {}
}
async function getAccessToken() {
  if (!accountManager) {
    accountManager = await AccountManager.loadFromDisk();
    accountManager.clearAllRateLimitsForFamily("claude");
    for (const a of accountManager.accounts) {
      delete a.coolingDownUntil;
    }
    console.log("Cleared memory rate limits.");
  }
  if (currentAccessToken && Date.now() < tokenExpiresAt) {
    return { token: currentAccessToken, email: currentAccountEmail, account: accountManager.accounts.find((a) => a.email === currentAccountEmail), isFallback: false };
  }
  let account = await accountManager.getCurrentOrNextForFamily("claude", null, "sequential");
  let isFallback = false;
  if (!account) {
    account = await accountManager.getCurrentOrNextForFamily("gemini", null, "sequential");
    if (!account) {
      throw new Error("All accounts (Claude and Gemini) are exhausted or rate limited!");
    }
    isFallback = true;
  }
  if (account && account.index !== lastNotifiedIndex) {
    if (lastNotifiedIndex !== -1) {
      pendingAlerts.push("\xF0\u0178\u201D\u201E Rotated to " + (isFallback ? "Gemini fallback: " : "") + "`" + account.email + "`");
    }
    lastNotifiedIndex = account.index;
  }
  return new Promise((resolve, reject) => {
    const postData = new URLSearchParams({
      client_id: "YOUR_GOOGLE_CLIENT_ID",
      client_secret: "YOUR_GOOGLE_CLIENT_SECRET",
      refresh_token: account.parts.refreshToken,
      grant_type: "refresh_token"
    }).toString();
    const options = {
      hostname: "oauth2.googleapis.com",
      path: "/token",
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(postData)
      }
    };
    const req = https.request(options, (res) => {
      let body = "";
      res.on("data", (d) => body += d);
      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const parsed = JSON.parse(body);
            currentAccessToken = parsed.access_token;
            currentAccountEmail = account.email || "Unknown";
            tokenExpiresAt = Date.now() + parsed.expires_in * 1000 - 60000;
            resolve({ token: currentAccessToken, email: currentAccountEmail, account });
          } catch (e) {
            reject(e);
          }
        } else {
          accountManager.markRateLimitedWithReason(account, isFallback ? "gemini" : "claude", "antigravity", null, "SERVER_ERROR");
          pendingAlerts.push("\xF0\u0178\u203A\u2018 Token refresh failed: `" + account.email + "`");
          reject(new Error(`Failed to refresh token: ${res.statusCode} ${body}`));
        }
      });
    });
    req.on("error", reject);
    req.write(postData);
    req.end();
  });
}
function translateAnthropicToGemini(anthropic) {
  const gemini = { contents: [] };
  if (anthropic.system) {
    gemini.systemInstruction = {
      parts: [{ text: typeof anthropic.system === "string" ? anthropic.system : JSON.stringify(anthropic.system) }]
    };
  }
  const toolSchemas = {};
  if (anthropic.tools) {
    for (const t of anthropic.tools) {
      const props = t.input_schema?.properties;
      const normalizedName = t.name.replace(/^[^:]+:/, "");
      if (props)
        toolSchemas[normalizedName] = new Set(Object.keys(props));
    }
  }
  if (anthropic.tools) {
    const sanitizeSchema = (schema) => {
      if (!schema || typeof schema !== "object")
        return schema;
      if (Array.isArray(schema))
        return schema.map(sanitizeSchema);
      const cleaned = {};
      const allowedKeys = ["type", "format", "description", "nullable", "enum", "properties", "required", "items"];
      for (const key of Object.keys(schema)) {
        if (allowedKeys.includes(key)) {
          if (key === "properties" && typeof schema[key] === "object" && !Array.isArray(schema[key])) {
            cleaned.properties = {};
            for (const propName of Object.keys(schema.properties)) {
              cleaned.properties[propName] = sanitizeSchema(schema.properties[propName]);
            }
          } else if (typeof schema[key] === "object") {
            cleaned[key] = sanitizeSchema(schema[key]);
          } else {
            cleaned[key] = schema[key];
          }
        }
      }
      if (cleaned.required && (!cleaned.properties || Object.keys(cleaned.properties).length === 0)) {
        delete cleaned.required;
      }
      return cleaned;
    };
    gemini.tools = [{
      functionDeclarations: anthropic.tools.map((t) => ({
        name: t.name,
        description: t.description || "",
        parameters: sanitizeSchema(t.input_schema)
      }))
    }];
    gemini.toolConfig = { functionCallingConfig: { mode: "AUTO" } };
  }
  for (const msg of anthropic.messages || []) {
    const role = msg.role === "assistant" ? "model" : "user";
    const parts = [];
    if (typeof msg.content === "string") {
      parts.push({ text: msg.content });
    } else if (Array.isArray(msg.content)) {
      for (const c of msg.content) {
        if (c.type === "text")
          parts.push({ text: c.text });
        if (c.type === "tool_use") {
          const fc = { name: c.name, args: c.input };
          const sig = recallThoughtSignature(c.id);
          if (sig)
            fc.thoughtSignature = sig;
          parts.push({ functionCall: fc });
        }
        if (c.type === "tool_result") {
          const contentText = typeof c.content === "string" ? c.content : JSON.stringify(c.content);
          parts.push({ functionResponse: { name: c.tool_use_id, response: { content: contentText } } });
        }
      }
    }
    gemini.contents.push({ role, parts });
  }
  return { gemini, toolSchemas };
}
var server = http.createServer((req, res) => {
  logDebug2(`${req.method} ${req.url}`);
  if (req.method === "POST" && req.url.startsWith("/v1/messages")) {
    let body = "";
    req.on("data", (chunk) => body += chunk);
    req.on("end", async () => {
      const MAX_ATTEMPTS = 4;
      async function attemptRequest(attempt) {
        try {
          const anthropicPayload = JSON.parse(body);
          let model = anthropicPayload.model || "sonnet-4.6";
          try {
            const { token, email, account, isFallback } = await getAccessToken();
            let actualProjectId = "galvanized-spot-7zsgc";
            try {
              const loadData = JSON.stringify({
                metadata: {
                  ideType: "IDE_UNSPECIFIED",
                  platform: "PLATFORM_UNSPECIFIED"
                }
              });
              const loadOptions = {
                hostname: "daily-cloudcode-pa.sandbox.googleapis.com",
                path: "/v1internal:loadCodeAssist",
                method: "POST",
                headers: {
                  Authorization: "Bearer " + token,
                  "Content-Type": "application/json",
                  "User-Agent": "google-api-nodejs-client/9.15.1",
                  "X-Goog-Api-Client": "google-cloud-sdk vscode_cloudshelleditor/0.1",
                  "Client-Metadata": "ideType=IDE_UNSPECIFIED,platform=PLATFORM_UNSPECIFIED,pluginType=GEMINI"
                }
              };
              const projectIdResult = await new Promise((resolve) => {
                const r = https.request(loadOptions, (rRes) => {
                  let b = "";
                  rRes.on("data", (d) => b += d);
                  rRes.on("end", () => {
                    logDebug2(`loadCodeAssist Status: ${rRes.statusCode}, Body: ${b}`);
                    try {
                      const p = JSON.parse(b);
                      if (p.cloudaicompanionProject) {
                        resolve(typeof p.cloudaicompanionProject === "string" ? p.cloudaicompanionProject : p.cloudaicompanionProject.id);
                      } else {
                        resolve(null);
                      }
                    } catch (e) {
                      resolve(null);
                    }
                  });
                });
                r.on("error", () => resolve(null));
                r.write(loadData);
                r.end();
              });
              if (projectIdResult) {
                actualProjectId = projectIdResult;
              }
            } catch (e) {
              logDebug2(`loadCodeAssist error: ${e.message}`);
            }
            let availableModels2 = await getLiveModels(token, actualProjectId);
            if (account && account.rateLimitResetTimes) {
              const nowMs2 = Date.now();
              availableModels2 = availableModels2.filter((m) => {
                const quotaModel = liveModelToQuotaModel(m);
                const base = m.includes("gemini") ? "gemini-antigravity" : "claude";
                const modelKey = `${base}:${quotaModel}`;
                return !(account.rateLimitResetTimes[modelKey] > nowMs2);
              });
            }
            let requestedModel = anthropicPayload.model || "sonnet";
            if (isFallback) {
              if (lastNotifiedIndex !== -1 && !pendingAlerts.some((a) => a.includes("Auto-Fallback"))) {
                pendingAlerts.push("\xF0\u0178\u201D\u201E Auto-Fallback: All Claude accounts rate-limited. Switched to Gemini.");
              }
              model = availableModels2.find((m) => m.includes("gemini-3.1-pro")) || availableModels2.find((m) => m.includes("gemini-3")) || availableModels2.find((m) => m.includes("gemini-1.5-pro")) || availableModels2.find((m) => m.includes("gemini")) || "antigravity-gemini-3.1-pro";
            } else {
              if (requestedModel.includes("opus")) {
                model = availableModels2.find((m) => m.includes("opus")) || "claude-opus-4-6-thinking";
              } else if (requestedModel.includes("haiku")) {
                model = availableModels2.find((m) => m.includes("haiku")) || availableModels2.find((m) => m.includes("gemini-3.1-pro")) || availableModels2.find((m) => m.includes("gemini-3")) || availableModels2.find((m) => m.includes("gemini-1.5-pro")) || "claude-sonnet-4-6";
              } else {
                model = availableModels2.find((m) => m.includes("sonnet")) || "claude-sonnet-4-6-thinking";
              }
            }
            logDebug2(`Using project: ${actualProjectId}, model: ${model}`);
            pendingAlerts.push(`\xF0\u0178\xA4\u2013 Using model: \`${model}\` (account: \`${email}\`)`);
            const { gemini: geminiPayload, toolSchemas } = translateAnthropicToGemini(anthropicPayload);
            const wrappedBody = {
              project: actualProjectId,
              model,
              request: geminiPayload,
              requestType: "agent",
              userAgent: "antigravity",
              requestId: "agent-" + Date.now()
            };
            const isGemini = model.includes("gemini");
            const targetHostname = isGemini ? "cloudcode-pa.googleapis.com" : "daily-cloudcode-pa.sandbox.googleapis.com";
            const options = {
              hostname: targetHostname,
              path: `/v1internal:streamGenerateContent?alt=sse`,
              method: "POST",
              headers: {
                Authorization: "Bearer " + token,
                "Content-Type": "application/json",
                "User-Agent": "antigravity/1.0.0 win32/x64"
              }
            };
            const proxyReq = https.request(options, (proxyRes) => {
              logDebug2(`Google API Status: ${proxyRes.statusCode}`);
              if (proxyRes.statusCode !== 200) {
                let errorBody = "";
                proxyRes.on("data", (chunk) => errorBody += chunk.toString());
                proxyRes.on("end", () => {
                  logDebug2(`Google API Error Body: ${errorBody}`);
                  if (proxyRes.statusCode === 429 || errorBody.includes("RESOURCE_EXHAUSTED")) {
                    logDebug2(`Account ${email} hit 429 on model ${model}, cooling down for 30 mins.`);
                    if (account) {
                      accountManager.markRateLimitedWithReason(account, isFallback ? "gemini" : "claude", "antigravity", liveModelToQuotaModel(model), "QUOTA_EXHAUSTED", 30 * 60 * 1000);
                      pendingAlerts.push("\xF0\u0178\u203A\u2018 Quota exhausted (429) for model `" + model + "`: `" + account.email + "`");
                    }
                    currentAccessToken = null;
                    if (attempt < MAX_ATTEMPTS) {
                      logDebug2(`Retrying with next account (attempt ${attempt + 1}/${MAX_ATTEMPTS})...`);
                      return attemptRequest(attempt + 1);
                    }
                  }
                  res.writeHead(500, { "Content-Type": "application/json" });
                  res.end(JSON.stringify({
                    type: "error",
                    error: {
                      type: "api_error",
                      message: `Google API Error: ${errorBody}`
                    }
                  }));
                });
                return;
              }
              res.writeHead(200, {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache",
                Connection: "keep-alive",
                "Access-Control-Allow-Origin": "*"
              });
              const msgId = "msg_" + Date.now();
              const startEvent = `event: message_start
data: {"type": "message_start", "message": { "id": "${msgId}", "role": "assistant", "content": [], "model": "${model}", "stop_reason": null, "stop_sequence": null }}

`;
              res.write(startEvent);
              let buffer = "";
              let textBlockStarted = false;
              let toolBlockStarted = false;
              let blockIndex = 0;
              let hadToolCall = false;
              let pendingThoughtSignature = null;
              res.write(`event: content_block_start
data: {"type": "content_block_start", "index": ${blockIndex}, "content_block": {"type": "text", "text": ""}}

`);
              textBlockStarted = true;
              let notification = `> \xE2\u0161\xA1 **Antigravity Proxy**
> \xF0\u0178\u2018\xA4 Account: \`${email}\``;
              if (pendingAlerts.length > 0) {
                notification += `
>
> **Alerts:**
` + pendingAlerts.map((a) => "> - " + a).join(`
`);
                pendingAlerts.length = 0;
              }
              if (anthropicPayload.model !== model) {
                notification += `
> \xF0\u0178\u201D\u201E Mapped model \`${anthropicPayload.model}\` to \`${model}\``;
              }
              notification += `

`;
              res.write(`event: content_block_delta
data: {"type": "content_block_delta", "index": ${blockIndex}, "delta": {"type": "text_delta", "text": ${JSON.stringify(notification)}}}

`);
              proxyRes.on("data", (chunk) => {
                const chunkStr = chunk.toString();
                logDebug2(`Raw Google chunk: ${chunkStr.substring(0, 500)}`);
                buffer += chunkStr;
                const lines = buffer.split(`
`);
                buffer = lines.pop();
                for (const line of lines) {
                  if (line.startsWith("data: ")) {
                    const dataStr = line.substring(6).trim();
                    if (dataStr === "[DONE]")
                      continue;
                    if (!dataStr)
                      continue;
                    try {
                      const eventData = JSON.parse(dataStr);
                      const payload = eventData.response || eventData;
                      const candidates = payload.candidates || [];
                      if (candidates.length > 0) {
                        const candidate = candidates[0];
                        const parts = candidate.content?.parts || [];
                        for (const part of parts) {
                          if (part.thoughtSignature) {
                            pendingThoughtSignature = part.thoughtSignature;
                          }
                          if (part.text) {
                            if (!textBlockStarted) {
                              res.write(`event: content_block_start
data: {"type": "content_block_start", "index": ${blockIndex}, "content_block": {"type": "text", "text": ""}}

`);
                              textBlockStarted = true;
                            }
                            res.write(`event: content_block_delta
data: {"type": "content_block_delta", "index": ${blockIndex}, "delta": {"type": "text_delta", "text": ${JSON.stringify(part.text)}}}

`);
                          }
                          if (part.functionCall) {
                            if (!toolBlockStarted) {
                              if (textBlockStarted) {
                                res.write(`event: content_block_stop
data: {"type": "content_block_stop", "index": ${blockIndex}}

`);
                                blockIndex++;
                                textBlockStarted = false;
                              }
                              const toolId = `tool_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
                              const sig = part.functionCall.thoughtSignature || part.functionCall.thought_signature || pendingThoughtSignature;
                              if (sig) {
                                storeThoughtSignature(toolId, sig);
                                pendingThoughtSignature = null;
                              }
                              res.write(`event: content_block_start
data: {"type": "content_block_start", "index": ${blockIndex}, "content_block": {"type": "tool_use", "id": "${toolId}", "name": "${part.functionCall.name}", "input": {}}}

`);
                              toolBlockStarted = true;
                              hadToolCall = true;
                            }
                            let args = part.functionCall.args || {};
                            const normalizedLookup = part.functionCall.name.replace(/^[^:]+:/, "");
                            const allowedProps = toolSchemas[normalizedLookup];
                            if (allowedProps && allowedProps.size > 0) {
                              args = Object.fromEntries(Object.entries(args).filter(([k]) => allowedProps.has(k)));
                            }
                            const argsJson = JSON.stringify(args);
                            res.write(`event: content_block_delta
data: {"type": "content_block_delta", "index": ${blockIndex}, "delta": {"type": "input_json_delta", "partial_json": ${JSON.stringify(argsJson)}}}

`);
                          }
                        }
                        if (candidate.finishReason) {
                          if (textBlockStarted || toolBlockStarted) {
                            res.write(`event: content_block_stop
data: {"type": "content_block_stop", "index": ${blockIndex}}

`);
                          }
                          const stopReason = hadToolCall ? "tool_use" : candidate.finishReason === "STOP" ? "end_turn" : "tool_use";
                          res.write(`event: message_delta
data: {"type": "message_delta", "delta": {"stop_reason": "${stopReason}"}}

`);
                          res.write(`event: message_stop
data: {"type": "message_stop"}

`);
                          res.end();
                          return;
                        }
                      }
                    } catch (e) {}
                  }
                }
              });
              proxyRes.on("end", () => {
                if (!res.writableEnded) {
                  res.write(`event: message_stop
data: {"type": "message_stop"}

`);
                  res.end();
                }
              });
              proxyRes.on("error", (err) => {
                logDebug2(`Proxy response error: ${err.message}`);
                if (!res.writableEnded) {
                  res.writeHead(500);
                  res.end(JSON.stringify({ error: err.message }));
                }
              });
            });
            proxyReq.on("error", (err) => {
              logDebug2(`Proxy request error: ${err.message}`);
              res.writeHead(500, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ error: err.message }));
            });
            proxyReq.write(JSON.stringify(wrappedBody));
            proxyReq.end();
          } catch (authError) {
            logDebug2(`Auth Error: ${authError.message}`);
            if (authError.message.includes("exhausted or rate limited")) {
              res.writeHead(400, { "Content-Type": "application/json" });
              res.end(JSON.stringify({
                type: "error",
                error: {
                  type: "invalid_request_error",
                  message: "Antigravity Proxy: " + authError.message
                }
              }));
            } else {
              res.writeHead(401, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ error: authError.message }));
            }
          }
        } catch (err) {
          logDebug2(`Error: ${err.message}`);
          res.writeHead(500);
          res.end(JSON.stringify({ error: err.message, stack: err.stack }));
        }
      }
      attemptRequest(1);
    });
  } else if (req.url.startsWith("/v1/models")) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      type: "model",
      id: "claude-opus-4-7",
      display_name: "Antigravity Model"
    }));
  } else {
    res.writeHead(404);
    res.end();
  }
});
server.listen(PORT, HOST, () => {
  console.log(`Antigravity Auth Proxy running on http://${HOST}:${PORT}`);
});
if (os.platform() === "win32") {
  let emptyChecks = 0;
  setInterval(() => {
    exec("wmic process get commandline", { windowsHide: true }, (err, stdout) => {
      if (err)
        return;
      const lines = stdout.toLowerCase().split(`
`);
      const hasActiveInstance = lines.some((line) => {
        if (line.includes("proxy.ts") || line.includes("proxy.js") || line.includes("wmic"))
          return false;
        return line.includes("opencode.exe") || line.includes("claude.exe") || line.includes("@anthropic-ai") || line.includes("opencode-ai\\\\bin") || line.match(/node\.exe.*claude/i);
      });
      if (!hasActiveInstance) {
        emptyChecks++;
        if (emptyChecks >= 2) {
          console.log("No active Claude/OpenCode instances detected. Shutting down background proxy.");
          process.exit(0);
        }
      } else {
        emptyChecks = 0;
      }
    });
  }, 15000);
}

