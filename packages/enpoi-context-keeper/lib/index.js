var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __knownSymbol = (name2, symbol) => (symbol = Symbol[name2]) ? symbol : /* @__PURE__ */ Symbol.for("Symbol." + name2);
var __typeError = (msg) => {
  throw TypeError(msg);
};
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __using = (stack, value, async) => {
  if (value != null) {
    if (typeof value !== "object" && typeof value !== "function") __typeError("Object expected");
    var dispose, inner;
    if (async) dispose = value[__knownSymbol("asyncDispose")];
    if (dispose === void 0) {
      dispose = value[__knownSymbol("dispose")];
      if (async) inner = dispose;
    }
    if (typeof dispose !== "function") __typeError("Object not disposable");
    if (inner) dispose = function() {
      try {
        inner.call(this);
      } catch (e) {
        return Promise.reject(e);
      }
    };
    stack.push([async, dispose, value]);
  } else if (async) {
    stack.push([async]);
  }
  return value;
};
var __callDispose = (stack, error, hasError) => {
  var E = typeof SuppressedError === "function" ? SuppressedError : function(e, s, m, _) {
    return _ = Error(m), _.name = "SuppressedError", _.error = e, _.suppressed = s, _;
  };
  var fail = (e) => error = hasError ? new E(e, error, "An error was suppressed during disposal") : (hasError = true, e);
  var next = (it) => {
    while (it = stack.pop()) {
      try {
        var result = it[1] && it[1].call(it[2]);
        if (it[0]) return Promise.resolve(result).then(next, (e) => (fail(e), next()));
      } catch (e) {
        fail(e);
      }
    }
    if (hasError) throw error;
  };
  return next();
};

// ../../node_modules/cosmokit/lib/index.cjs
var require_lib = __commonJS({
  "../../node_modules/cosmokit/lib/index.cjs"(exports, module) {
    "use strict";
    var __defProp2 = Object.defineProperty;
    var __getOwnPropDesc2 = Object.getOwnPropertyDescriptor;
    var __getOwnPropNames2 = Object.getOwnPropertyNames;
    var __hasOwnProp2 = Object.prototype.hasOwnProperty;
    var __export = (target, all) => {
      for (var name2 in all)
        __defProp2(target, name2, { get: all[name2], enumerable: true });
    };
    var __copyProps2 = (to, from, except, desc) => {
      if (from && typeof from === "object" || typeof from === "function") {
        for (let key of __getOwnPropNames2(from))
          if (!__hasOwnProp2.call(to, key) && key !== except)
            __defProp2(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc2(from, key)) || desc.enumerable });
      }
      return to;
    };
    var __toCommonJS = (mod) => __copyProps2(__defProp2({}, "__esModule", { value: true }), mod);
    var index_exports = {};
    __export(index_exports, {
      Binary: () => Binary,
      Time: () => Time,
      arrayBufferToBase64: () => arrayBufferToBase64,
      arrayBufferToHex: () => arrayBufferToHex,
      base64ToArrayBuffer: () => base64ToArrayBuffer,
      camelCase: () => camelCase,
      camelize: () => camelize,
      capitalize: () => capitalize,
      clone: () => clone,
      contain: () => contain,
      deduplicate: () => deduplicate,
      deepEqual: () => deepEqual,
      defineProperty: () => defineProperty,
      difference: () => difference,
      filterKeys: () => filterKeys,
      formatProperty: () => formatProperty,
      hexToArrayBuffer: () => hexToArrayBuffer,
      hyphenate: () => hyphenate,
      intersection: () => intersection,
      is: () => is,
      isNonNullable: () => isNonNullable,
      isNullable: () => isNullable,
      isPlainObject: () => isPlainObject,
      makeArray: () => makeArray,
      mapValues: () => mapValues,
      noop: () => noop,
      omit: () => omit,
      paramCase: () => paramCase,
      pick: () => pick,
      remove: () => remove,
      sanitize: () => sanitize,
      snakeCase: () => snakeCase,
      trimSlash: () => trimSlash,
      uncapitalize: () => uncapitalize,
      union: () => union,
      valueMap: () => mapValues
    });
    module.exports = __toCommonJS(index_exports);
    function noop() {
    }
    function isNullable(value) {
      return value === null || value === void 0;
    }
    function isNonNullable(value) {
      return !isNullable(value);
    }
    function isPlainObject(data) {
      return data && typeof data === "object" && !Array.isArray(data);
    }
    function filterKeys(object, filter) {
      return Object.fromEntries(Object.entries(object).filter(([key, value]) => filter(key, value)));
    }
    function mapValues(object, transform) {
      return Object.fromEntries(Object.entries(object).map(([key, value]) => [key, transform(value, key)]));
    }
    function pick(source, keys, forced) {
      if (!keys) return { ...source };
      const result = {};
      for (const key of keys) {
        if (forced || source[key] !== void 0) result[key] = source[key];
      }
      return result;
    }
    function omit(source, keys) {
      if (!keys) return { ...source };
      const result = { ...source };
      for (const key of keys) {
        Reflect.deleteProperty(result, key);
      }
      return result;
    }
    function defineProperty(object, key, value) {
      return Object.defineProperty(object, key, { writable: true, value, enumerable: false });
    }
    function contain(array1, array2) {
      return array2.every((item) => array1.includes(item));
    }
    function intersection(array1, array2) {
      return array1.filter((item) => array2.includes(item));
    }
    function difference(array1, array2) {
      return array1.filter((item) => !array2.includes(item));
    }
    function union(array1, array2) {
      return Array.from(/* @__PURE__ */ new Set([...array1, ...array2]));
    }
    function deduplicate(array) {
      return [...new Set(array)];
    }
    function remove(list, item) {
      const index = list?.indexOf(item);
      if (index >= 0) {
        list.splice(index, 1);
        return true;
      } else {
        return false;
      }
    }
    function makeArray(source) {
      return Array.isArray(source) ? source : isNullable(source) ? [] : [source];
    }
    function is(type, value) {
      if (arguments.length === 1) return (value2) => is(type, value2);
      return type in globalThis && value instanceof globalThis[type] || Object.prototype.toString.call(value).slice(8, -1) === type;
    }
    function isArrayBufferLike(value) {
      return is("ArrayBuffer", value) || is("SharedArrayBuffer", value);
    }
    function isArrayBufferSource(value) {
      return isArrayBufferLike(value) || ArrayBuffer.isView(value);
    }
    var Binary;
    ((Binary2) => {
      Binary2.is = isArrayBufferLike;
      Binary2.isSource = isArrayBufferSource;
      function fromSource(source) {
        if (ArrayBuffer.isView(source)) {
          return source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
        } else {
          return source;
        }
      }
      Binary2.fromSource = fromSource;
      function toBase64(source) {
        source = fromSource(source);
        if (typeof Buffer !== "undefined") {
          return Buffer.from(source).toString("base64");
        }
        let binary = "";
        const bytes = new Uint8Array(source);
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
      }
      Binary2.toBase64 = toBase64;
      function fromBase64(source) {
        if (typeof Buffer !== "undefined") return fromSource(Buffer.from(source, "base64"));
        return Uint8Array.from(atob(source), (c) => c.charCodeAt(0));
      }
      Binary2.fromBase64 = fromBase64;
      function toHex(source) {
        source = fromSource(source);
        if (typeof Buffer !== "undefined") return Buffer.from(source).toString("hex");
        return Array.from(new Uint8Array(source), (byte) => byte.toString(16).padStart(2, "0")).join("");
      }
      Binary2.toHex = toHex;
      function fromHex(source) {
        if (typeof Buffer !== "undefined") return fromSource(Buffer.from(source, "hex"));
        const hex = source.length % 2 === 0 ? source : source.slice(0, source.length - 1);
        const buffer = [];
        for (let i = 0; i < hex.length; i += 2) {
          buffer.push(parseInt(`${hex[i]}${hex[i + 1]}`, 16));
        }
        return Uint8Array.from(buffer).buffer;
      }
      Binary2.fromHex = fromHex;
    })(Binary || (Binary = {}));
    var base64ToArrayBuffer = Binary.fromBase64;
    var arrayBufferToBase64 = Binary.toBase64;
    var hexToArrayBuffer = Binary.fromHex;
    var arrayBufferToHex = Binary.toHex;
    function clone(source, refs = /* @__PURE__ */ new Map()) {
      if (!source || typeof source !== "object") return source;
      if (is("Date", source)) return new Date(source.valueOf());
      if (is("RegExp", source)) return new RegExp(source.source, source.flags);
      if (isArrayBufferLike(source)) return source.slice(0);
      if (ArrayBuffer.isView(source)) return source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
      const cached = refs.get(source);
      if (cached) return cached;
      if (Array.isArray(source)) {
        const result2 = [];
        refs.set(source, result2);
        source.forEach((value, index) => {
          result2[index] = Reflect.apply(clone, null, [value, refs]);
        });
        return result2;
      }
      const result = Object.create(Object.getPrototypeOf(source));
      refs.set(source, result);
      for (const key of Reflect.ownKeys(source)) {
        const descriptor = { ...Reflect.getOwnPropertyDescriptor(source, key) };
        if ("value" in descriptor) {
          descriptor.value = Reflect.apply(clone, null, [descriptor.value, refs]);
        }
        Reflect.defineProperty(result, key, descriptor);
      }
      return result;
    }
    function deepEqual(a, b, strict) {
      if (a === b) return true;
      if (!strict && isNullable(a) && isNullable(b)) return true;
      if (typeof a !== typeof b) return false;
      if (typeof a !== "object") return false;
      if (!a || !b) return false;
      function check(test, then) {
        return test(a) ? test(b) ? then(a, b) : false : test(b) ? false : void 0;
      }
      return check(Array.isArray, (a2, b2) => a2.length === b2.length && a2.every((item, index) => deepEqual(item, b2[index]))) ?? check(is("Date"), (a2, b2) => a2.valueOf() === b2.valueOf()) ?? check(is("RegExp"), (a2, b2) => a2.source === b2.source && a2.flags === b2.flags) ?? check(isArrayBufferLike, (a2, b2) => {
        if (a2.byteLength !== b2.byteLength) return false;
        const viewA = new Uint8Array(a2);
        const viewB = new Uint8Array(b2);
        for (let i = 0; i < viewA.length; i++) {
          if (viewA[i] !== viewB[i]) return false;
        }
        return true;
      }) ?? Object.keys({ ...a, ...b }).every((key) => deepEqual(a[key], b[key], strict));
    }
    function capitalize(source) {
      return source.charAt(0).toUpperCase() + source.slice(1);
    }
    function uncapitalize(source) {
      return source.charAt(0).toLowerCase() + source.slice(1);
    }
    function camelCase(source) {
      return source.replace(/[_-][a-z]/g, (str) => str.slice(1).toUpperCase());
    }
    function tokenize(source, delimiters, delimiter) {
      const output = [];
      let state = 0;
      for (let i = 0; i < source.length; i++) {
        const code = source.charCodeAt(i);
        if (code >= 65 && code <= 90) {
          if (state === 1) {
            const next = source.charCodeAt(i + 1);
            if (next >= 97 && next <= 122) {
              output.push(delimiter);
            }
            output.push(code + 32);
          } else {
            if (state !== 0) {
              output.push(delimiter);
            }
            output.push(code + 32);
          }
          state = 1;
        } else if (code >= 97 && code <= 122) {
          output.push(code);
          state = 2;
        } else if (delimiters.includes(code)) {
          if (state !== 0) {
            output.push(delimiter);
          }
          state = 0;
        } else {
          output.push(code);
        }
      }
      return String.fromCharCode(...output);
    }
    function paramCase(source) {
      return tokenize(source, [45, 95], 45);
    }
    function snakeCase(source) {
      return tokenize(source, [45, 95], 95);
    }
    var camelize = camelCase;
    var hyphenate = paramCase;
    function formatProperty(key) {
      if (typeof key !== "string") return `[${key.toString()}]`;
      return /^[a-z_$][\w$]*$/i.test(key) ? `.${key}` : `[${JSON.stringify(key)}]`;
    }
    function trimSlash(source) {
      return source.replace(/\/$/, "");
    }
    function sanitize(source) {
      if (!source.startsWith("/")) source = "/" + source;
      return trimSlash(source);
    }
    var Time;
    ((Time2) => {
      Time2.millisecond = 1;
      Time2.second = 1e3;
      Time2.minute = Time2.second * 60;
      Time2.hour = Time2.minute * 60;
      Time2.day = Time2.hour * 24;
      Time2.week = Time2.day * 7;
      let timezoneOffset = (/* @__PURE__ */ new Date()).getTimezoneOffset();
      function setTimezoneOffset(offset) {
        timezoneOffset = offset;
      }
      Time2.setTimezoneOffset = setTimezoneOffset;
      function getTimezoneOffset() {
        return timezoneOffset;
      }
      Time2.getTimezoneOffset = getTimezoneOffset;
      function getDateNumber(date = /* @__PURE__ */ new Date(), offset) {
        if (typeof date === "number") date = new Date(date);
        if (offset === void 0) offset = timezoneOffset;
        return Math.floor((date.valueOf() / Time2.minute - offset) / 1440);
      }
      Time2.getDateNumber = getDateNumber;
      function fromDateNumber(value, offset) {
        const date = new Date(value * Time2.day);
        if (offset === void 0) offset = timezoneOffset;
        return new Date(+date + offset * Time2.minute);
      }
      Time2.fromDateNumber = fromDateNumber;
      const numeric = /\d+(?:\.\d+)?/.source;
      const timeRegExp = new RegExp(`^${[
        "w(?:eek(?:s)?)?",
        "d(?:ay(?:s)?)?",
        "h(?:our(?:s)?)?",
        "m(?:in(?:ute)?(?:s)?)?",
        "s(?:ec(?:ond)?(?:s)?)?"
      ].map((unit) => `(${numeric}${unit})?`).join("")}$`);
      function parseTime(source) {
        const capture = timeRegExp.exec(source);
        if (!capture) return 0;
        return (parseFloat(capture[1]) * Time2.week || 0) + (parseFloat(capture[2]) * Time2.day || 0) + (parseFloat(capture[3]) * Time2.hour || 0) + (parseFloat(capture[4]) * Time2.minute || 0) + (parseFloat(capture[5]) * Time2.second || 0);
      }
      Time2.parseTime = parseTime;
      function parseDate(date) {
        const parsed = parseTime(date);
        if (parsed) {
          date = Date.now() + parsed;
        } else if (/^\d{1,2}(:\d{1,2}){1,2}$/.test(date)) {
          date = `${(/* @__PURE__ */ new Date()).toLocaleDateString()}-${date}`;
        } else if (/^\d{1,2}-\d{1,2}-\d{1,2}(:\d{1,2}){1,2}$/.test(date)) {
          date = `${(/* @__PURE__ */ new Date()).getFullYear()}-${date}`;
        }
        return date ? new Date(date) : /* @__PURE__ */ new Date();
      }
      Time2.parseDate = parseDate;
      function format(ms) {
        const abs = Math.abs(ms);
        if (abs >= Time2.day - Time2.hour / 2) {
          return Math.round(ms / Time2.day) + "d";
        } else if (abs >= Time2.hour - Time2.minute / 2) {
          return Math.round(ms / Time2.hour) + "h";
        } else if (abs >= Time2.minute - Time2.second / 2) {
          return Math.round(ms / Time2.minute) + "m";
        } else if (abs >= Time2.second) {
          return Math.round(ms / Time2.second) + "s";
        }
        return ms + "ms";
      }
      Time2.format = format;
      function toDigits(source, length = 2) {
        return source.toString().padStart(length, "0");
      }
      Time2.toDigits = toDigits;
      function template(template2, time = /* @__PURE__ */ new Date()) {
        return template2.replace("yyyy", time.getFullYear().toString()).replace("yy", time.getFullYear().toString().slice(2)).replace("MM", toDigits(time.getMonth() + 1)).replace("dd", toDigits(time.getDate())).replace("hh", toDigits(time.getHours())).replace("mm", toDigits(time.getMinutes())).replace("ss", toDigits(time.getSeconds())).replace("SSS", toDigits(time.getMilliseconds(), 3));
      }
      Time2.template = template;
    })(Time || (Time = {}));
  }
});

// ../../node_modules/schemastery/lib/index.cjs
var require_lib2 = __commonJS({
  "../../node_modules/schemastery/lib/index.cjs"(exports, module) {
    "use strict";
    var __defProp2 = Object.defineProperty;
    var __name = (target, value) => __defProp2(target, "name", { value, configurable: true });
    var import_cosmokit = require_lib();
    var kSchema = /* @__PURE__ */ Symbol.for("schemastery");
    var kValidationError = /* @__PURE__ */ Symbol.for("ValidationError");
    globalThis.__schemastery_index__ ??= 0;
    globalThis.__schemastery_refs__ = void 0;
    var ValidationError = class extends TypeError {
      constructor(message, options) {
        let prefix = "$";
        for (const segment of options.path || []) {
          if (typeof segment === "string") {
            prefix += "." + segment;
          } else if (typeof segment === "number") {
            prefix += "[" + segment + "]";
          } else if (typeof segment === "symbol") {
            prefix += `[Symbol(${segment.toString()})]`;
          }
        }
        if (prefix.startsWith(".")) prefix = prefix.slice(1);
        super((prefix === "$" ? "" : `${prefix} `) + message);
        this.options = options;
      }
      static {
        __name(this, "ValidationError");
      }
      name = "ValidationError";
      static is(error) {
        return !!error?.[kValidationError];
      }
    };
    Object.defineProperty(ValidationError.prototype, kValidationError, {
      value: true
    });
    var Schema2 = /* @__PURE__ */ __name(function(options) {
      const schema = /* @__PURE__ */ __name(function(data, options2 = {}) {
        return Schema2.resolve(data, schema, options2)[0];
      }, "schema");
      if (options.refs) {
        const refs = (0, import_cosmokit.valueMap)(options.refs, (options2) => new Schema2(options2));
        const getRef = /* @__PURE__ */ __name((uid) => refs[uid], "getRef");
        for (const key in refs) {
          const options2 = refs[key];
          options2.sKey = getRef(options2.sKey);
          options2.inner = getRef(options2.inner);
          options2.list = options2.list && options2.list.map(getRef);
          options2.dict = options2.dict && (0, import_cosmokit.valueMap)(options2.dict, getRef);
        }
        return refs[options.uid];
      }
      Object.assign(schema, options);
      if (typeof schema.callback === "string") {
        try {
          schema.callback = new Function("return " + schema.callback)();
        } catch {
        }
      }
      Object.defineProperty(schema, "uid", { value: globalThis.__schemastery_index__++ });
      Object.setPrototypeOf(schema, Schema2.prototype);
      schema.meta ||= {};
      schema.toString = schema.toString.bind(schema);
      return schema;
    }, "Schema");
    Schema2.prototype = Object.create(Function.prototype);
    Schema2.prototype[kSchema] = true;
    Object.defineProperty(Schema2.prototype, "~standard", {
      get() {
        return {
          version: 1,
          vendor: "schemastery",
          validate: /* @__PURE__ */ __name((value) => {
            try {
              return { value: Schema2.resolve(value, this, {})[0] };
            } catch (error) {
              if (ValidationError.is(error)) {
                return { issues: [{ message: error.message, path: error.options.path }] };
              }
              throw error;
            }
          }, "validate")
        };
      }
    });
    Schema2.ValidationError = ValidationError;
    Schema2.prototype.toJSON = /* @__PURE__ */ __name(function toJSON() {
      if (globalThis.__schemastery_refs__) {
        globalThis.__schemastery_refs__[this.uid] ??= JSON.parse(JSON.stringify({ ...this }));
        return this.uid;
      }
      globalThis.__schemastery_refs__ = { [this.uid]: { ...this } };
      globalThis.__schemastery_refs__[this.uid] = JSON.parse(JSON.stringify({ ...this }));
      const result = { uid: this.uid, refs: globalThis.__schemastery_refs__ };
      globalThis.__schemastery_refs__ = void 0;
      return result;
    }, "toJSON");
    Schema2.prototype.set = /* @__PURE__ */ __name(function set(key, value) {
      this.dict[key] = value;
      return this;
    }, "set");
    Schema2.prototype.push = /* @__PURE__ */ __name(function push(value) {
      this.list.push(value);
      return this;
    }, "push");
    function mergeDesc(original, messages) {
      const result = typeof original === "string" ? { "": original } : { ...original };
      for (const locale in messages) {
        const value = messages[locale];
        if (value?.$description || value?.$desc) {
          result[locale] = value.$description || value.$desc;
        } else if (typeof value === "string") {
          result[locale] = value;
        }
      }
      return result;
    }
    __name(mergeDesc, "mergeDesc");
    function getInner(value) {
      return value?.$value ?? value?.$inner;
    }
    __name(getInner, "getInner");
    function extractKeys(data) {
      return (0, import_cosmokit.filterKeys)(data ?? {}, (key) => !key.startsWith("$"));
    }
    __name(extractKeys, "extractKeys");
    Schema2.prototype.i18n = /* @__PURE__ */ __name(function i18n(messages) {
      const schema = Schema2(this);
      const desc = mergeDesc(schema.meta.description, messages);
      if (Object.keys(desc).length) schema.meta.description = desc;
      if (schema.dict) {
        schema.dict = (0, import_cosmokit.valueMap)(schema.dict, (inner, key) => {
          return inner.i18n((0, import_cosmokit.valueMap)(messages, (data) => getInner(data)?.[key] ?? data?.[key]));
        });
      }
      if (schema.list) {
        schema.list = schema.list.map((inner, index) => {
          return inner.i18n((0, import_cosmokit.valueMap)(messages, (data = {}) => {
            if (Array.isArray(getInner(data))) return getInner(data)[index];
            if (Array.isArray(data)) return data[index];
            return extractKeys(data);
          }));
        });
      }
      if (schema.inner) {
        schema.inner = schema.inner.i18n((0, import_cosmokit.valueMap)(messages, (data) => {
          if (getInner(data)) return getInner(data);
          return extractKeys(data);
        }));
      }
      if (schema.sKey) {
        schema.sKey = schema.sKey.i18n((0, import_cosmokit.valueMap)(messages, (data) => data?.$key));
      }
      return schema;
    }, "i18n");
    Schema2.prototype.extra = /* @__PURE__ */ __name(function extra(key, value) {
      const schema = Schema2(this);
      schema.meta = { ...schema.meta, [key]: value };
      return schema;
    }, "extra");
    for (const key of ["required", "disabled", "collapse", "hidden", "loose"]) {
      Object.assign(Schema2.prototype, {
        [key](value = true) {
          const schema = Schema2(this);
          schema.meta = { ...schema.meta, [key]: value };
          return schema;
        }
      });
    }
    Schema2.prototype.deprecated = /* @__PURE__ */ __name(function deprecated() {
      const schema = Schema2(this);
      schema.meta.badges ||= [];
      schema.meta.badges.push({ text: "deprecated", type: "danger" });
      return schema;
    }, "deprecated");
    Schema2.prototype.experimental = /* @__PURE__ */ __name(function experimental() {
      const schema = Schema2(this);
      schema.meta.badges ||= [];
      schema.meta.badges.push({ text: "experimental", type: "warning" });
      return schema;
    }, "experimental");
    Schema2.prototype.pattern = /* @__PURE__ */ __name(function pattern(regexp) {
      const schema = Schema2(this);
      const pattern2 = (0, import_cosmokit.pick)(regexp, ["source", "flags"]);
      schema.meta = { ...schema.meta, pattern: pattern2 };
      return schema;
    }, "pattern");
    Schema2.prototype.simplify = /* @__PURE__ */ __name(function simplify(value) {
      if ((0, import_cosmokit.deepEqual)(value, this.meta.default, this.type === "dict")) return null;
      if ((0, import_cosmokit.isNullable)(value)) return value;
      if (this.type === "object" || this.type === "dict") {
        const result = {};
        for (const key in value) {
          const schema = this.type === "object" ? this.dict[key] : this.inner;
          const item = schema?.simplify(value[key]);
          if (this.type === "dict" || !(0, import_cosmokit.isNullable)(item)) result[key] = item;
        }
        if ((0, import_cosmokit.deepEqual)(result, this.meta.default, this.type === "dict")) return null;
        return result;
      } else if (this.type === "array" || this.type === "tuple") {
        const result = [];
        value.forEach((value2, index) => {
          const schema = this.type === "array" ? this.inner : this.list[index];
          const item = schema ? schema.simplify(value2) : value2;
          result.push(item);
        });
        return result;
      } else if (this.type === "intersect") {
        const result = {};
        for (const item of this.list) {
          Object.assign(result, item.simplify(value));
        }
        return result;
      } else if (this.type === "union") {
        for (const schema of this.list) {
          try {
            Schema2.resolve(value, schema, {});
            return schema.simplify(value);
          } catch {
          }
        }
      }
      return value;
    }, "simplify");
    Schema2.prototype.toString = /* @__PURE__ */ __name(function toString(inline) {
      return formatters[this.type]?.(this, inline) ?? `Schema<${this.type}>`;
    }, "toString");
    Schema2.prototype.role = /* @__PURE__ */ __name(function role(role, extra2) {
      const schema = Schema2(this);
      schema.meta = { ...schema.meta, role, extra: extra2 };
      return schema;
    }, "role");
    for (const key of ["default", "link", "comment", "description", "max", "min", "step"]) {
      Object.assign(Schema2.prototype, {
        [key](value) {
          const schema = Schema2(this);
          schema.meta = { ...schema.meta, [key]: value };
          return schema;
        }
      });
    }
    var resolvers = {};
    Schema2.extend = /* @__PURE__ */ __name(function extend(type, resolve2) {
      resolvers[type] = resolve2;
    }, "extend");
    Schema2.resolve = /* @__PURE__ */ __name(function resolve(data, schema, options = {}, strict = false) {
      if (!schema) return [data];
      if (options.ignore?.(data, schema)) return [data];
      if ((0, import_cosmokit.isNullable)(data) && schema.type !== "lazy") {
        if (schema.meta.required) throw new ValidationError(`missing required value`, options);
        let current = schema;
        let fallback = schema.meta.default;
        while (current?.type === "intersect" && (0, import_cosmokit.isNullable)(fallback)) {
          current = current.list[0];
          fallback = current?.meta.default;
        }
        if ((0, import_cosmokit.isNullable)(fallback)) return [data];
        data = (0, import_cosmokit.clone)(fallback);
      }
      const callback = resolvers[schema.type];
      if (!callback) throw new ValidationError(`unsupported type "${schema.type}"`, options);
      try {
        return callback(data, schema, options, strict);
      } catch (error) {
        if (!schema.meta.loose) throw error;
        return [schema.meta.default];
      }
    }, "resolve");
    Schema2.from = /* @__PURE__ */ __name(function from(source) {
      if ((0, import_cosmokit.isNullable)(source)) {
        return Schema2.any();
      } else if (["string", "number", "boolean"].includes(typeof source)) {
        return Schema2.const(source).required();
      } else if (source[kSchema]) {
        return source;
      } else if (typeof source === "function") {
        switch (source) {
          case String:
            return Schema2.string().required();
          case Number:
            return Schema2.number().required();
          case Boolean:
            return Schema2.boolean().required();
          case Function:
            return Schema2.function().required();
          default:
            return Schema2.is(source).required();
        }
      } else {
        throw new TypeError(`cannot infer schema from ${source}`);
      }
    }, "from");
    Schema2.lazy = /* @__PURE__ */ __name(function lazy(builder) {
      const toJSON2 = /* @__PURE__ */ __name(() => {
        if (!schema.inner[kSchema]) {
          schema.inner = schema.builder();
          schema.inner.meta = { ...schema.meta, ...schema.inner.meta };
        }
        return schema.inner.toJSON();
      }, "toJSON");
      const schema = new Schema2({ type: "lazy", builder, inner: { toJSON: toJSON2 } });
      return schema;
    }, "lazy");
    Schema2.natural = /* @__PURE__ */ __name(function natural() {
      return Schema2.number().step(1).min(0);
    }, "natural");
    Schema2.percent = /* @__PURE__ */ __name(function percent() {
      return Schema2.number().step(0.01).min(0).max(1).role("slider");
    }, "percent");
    Schema2.date = /* @__PURE__ */ __name(function date() {
      return Schema2.union([
        Schema2.is(Date),
        Schema2.transform(Schema2.string().role("datetime"), (value, options) => {
          const date2 = new Date(value);
          if (isNaN(+date2)) throw new ValidationError(`invalid date "${value}"`, options);
          return date2;
        }, true)
      ]);
    }, "date");
    Schema2.regExp = /* @__PURE__ */ __name(function regExp(flag = "") {
      return Schema2.union([
        Schema2.is(RegExp),
        Schema2.transform(Schema2.string().role("regexp", { flag }), (value, options) => {
          try {
            return new RegExp(value, flag);
          } catch (e) {
            throw new ValidationError(e.message, options);
          }
        }, true)
      ]);
    }, "regExp");
    Schema2.arrayBuffer = /* @__PURE__ */ __name(function arrayBuffer(encoding) {
      return Schema2.union([
        Schema2.is(ArrayBuffer),
        Schema2.is(SharedArrayBuffer),
        Schema2.transform(Schema2.any(), (value, options) => {
          if (import_cosmokit.Binary.isSource(value)) return import_cosmokit.Binary.fromSource(value);
          throw new ValidationError(`expected ArrayBufferSource but got ${value}`, options);
        }, true),
        ...encoding ? [Schema2.transform(Schema2.string(), (value, options) => {
          try {
            return encoding === "base64" ? import_cosmokit.Binary.fromBase64(value) : import_cosmokit.Binary.fromHex(value);
          } catch (e) {
            throw new ValidationError(e.message, options);
          }
        }, true)] : []
      ]);
    }, "arrayBuffer");
    Schema2.extend("lazy", (data, schema, options, strict) => {
      if (!schema.inner[kSchema]) {
        schema.inner = schema.builder();
        schema.inner.meta = { ...schema.meta, ...schema.inner.meta };
      }
      return Schema2.resolve(data, schema.inner, options, strict);
    });
    Schema2.extend("any", (data) => {
      return [data];
    });
    Schema2.extend("never", (data, _, options) => {
      throw new ValidationError(`expected nullable but got ${data}`, options);
    });
    Schema2.extend("const", (data, { value }, options) => {
      if ((0, import_cosmokit.deepEqual)(data, value)) return [value];
      throw new ValidationError(`expected ${value} but got ${data}`, options);
    });
    function checkWithinRange(data, meta, description, options, skipMin = false) {
      const { max = Infinity, min = -Infinity } = meta;
      if (data > max) throw new ValidationError(`expected ${description} <= ${max} but got ${data}`, options);
      if (data < min && !skipMin) throw new ValidationError(`expected ${description} >= ${min} but got ${data}`, options);
    }
    __name(checkWithinRange, "checkWithinRange");
    Schema2.extend("string", (data, { meta }, options) => {
      if (typeof data !== "string") throw new ValidationError(`expected string but got ${data}`, options);
      if (meta.pattern) {
        const regexp = new RegExp(meta.pattern.source, meta.pattern.flags);
        if (!regexp.test(data)) throw new ValidationError(`expect string to match regexp ${regexp}`, options);
      }
      checkWithinRange(data.length, meta, "string length", options);
      return [data];
    });
    function decimalShift(data, digits) {
      const str = data.toString();
      if (str.includes("e")) return data * Math.pow(10, digits);
      const index = str.indexOf(".");
      if (index === -1) return data * Math.pow(10, digits);
      const frac = str.slice(index + 1);
      const integer = str.slice(0, index);
      if (frac.length <= digits) return +(integer + frac.padEnd(digits, "0"));
      return +(integer + frac.slice(0, digits) + "." + frac.slice(digits));
    }
    __name(decimalShift, "decimalShift");
    function isMultipleOf(data, min, step) {
      step = Math.abs(step);
      if (!/^\d+\.\d+$/.test(step.toString())) {
        return (data - min) % step === 0;
      }
      const index = step.toString().indexOf(".");
      const digits = step.toString().slice(index + 1).length;
      return Math.abs(decimalShift(data, digits) - decimalShift(min, digits)) % decimalShift(step, digits) === 0;
    }
    __name(isMultipleOf, "isMultipleOf");
    Schema2.extend("number", (data, { meta }, options) => {
      if (typeof data !== "number") throw new ValidationError(`expected number but got ${data}`, options);
      checkWithinRange(data, meta, "number", options);
      const { step } = meta;
      if (step && !isMultipleOf(data, meta.min ?? 0, step)) {
        throw new ValidationError(`expected number multiple of ${step} but got ${data}`, options);
      }
      return [data];
    });
    Schema2.extend("boolean", (data, _, options) => {
      if (typeof data === "boolean") return [data];
      throw new ValidationError(`expected boolean but got ${data}`, options);
    });
    Schema2.extend("bitset", (data, { bits, meta }, options) => {
      let value = 0, keys = [];
      if (typeof data === "number") {
        value = data;
        for (const key in bits) {
          if (data & bits[key]) {
            keys.push(key);
          }
        }
      } else if (Array.isArray(data)) {
        keys = data;
        for (const key of keys) {
          if (typeof key !== "string") throw new ValidationError(`expected string but got ${key}`, options);
          if (key in bits) value |= bits[key];
        }
      } else {
        throw new ValidationError(`expected number or array but got ${data}`, options);
      }
      if (value === meta.default) return [value];
      return [value, keys];
    });
    Schema2.extend("function", (data, _, options) => {
      if (typeof data === "function") return [data];
      throw new ValidationError(`expected function but got ${data}`, options);
    });
    Schema2.extend("is", (data, { constructor }, options) => {
      if (typeof constructor === "function") {
        if (data instanceof constructor) return [data];
        throw new ValidationError(`expected ${constructor.name} but got ${data}`, options);
      } else {
        if ((0, import_cosmokit.isNullable)(data)) {
          throw new ValidationError(`expected ${constructor} but got ${data}`, options);
        }
        let prototype = Object.getPrototypeOf(data);
        while (prototype) {
          if (prototype.constructor?.name === constructor) return [data];
          prototype = Object.getPrototypeOf(prototype);
        }
        throw new ValidationError(`expected ${constructor} but got ${data}`, options);
      }
    });
    function property(data, key, schema, options) {
      try {
        const [value, adapted] = Schema2.resolve(data[key], schema, {
          ...options,
          path: [...options.path || [], key]
        });
        if (adapted !== void 0) data[key] = adapted;
        return value;
      } catch (e) {
        if (!options?.autofix) throw e;
        delete data[key];
        return schema.meta.default;
      }
    }
    __name(property, "property");
    Schema2.extend("array", (data, { inner, meta }, options) => {
      if (!Array.isArray(data)) throw new ValidationError(`expected array but got ${data}`, options);
      checkWithinRange(data.length, meta, "array length", options, !(0, import_cosmokit.isNullable)(inner.meta.default));
      return [data.map((_, index) => property(data, index, inner, options))];
    });
    Schema2.extend("dict", (data, { inner, sKey }, options, strict) => {
      if (!(0, import_cosmokit.isPlainObject)(data)) throw new ValidationError(`expected object but got ${data}`, options);
      const result = {};
      for (const key in data) {
        let rKey;
        try {
          rKey = Schema2.resolve(key, sKey, options)[0];
        } catch (error) {
          if (strict) continue;
          throw error;
        }
        result[rKey] = property(data, key, inner, options);
        data[rKey] = data[key];
        if (key !== rKey) delete data[key];
      }
      return [result];
    });
    Schema2.extend("tuple", (data, { list }, options, strict) => {
      if (!Array.isArray(data)) throw new ValidationError(`expected array but got ${data}`, options);
      const result = list.map((inner, index) => property(data, index, inner, options));
      if (strict) return [result];
      result.push(...data.slice(list.length));
      return [result];
    });
    function merge(result, data) {
      for (const key in data) {
        if (key in result) continue;
        result[key] = data[key];
      }
    }
    __name(merge, "merge");
    Schema2.extend("object", (data, { dict }, options, strict) => {
      if (!(0, import_cosmokit.isPlainObject)(data)) throw new ValidationError(`expected object but got ${data}`, options);
      const result = {};
      for (const key in dict) {
        const value = property(data, key, dict[key], options);
        if (!(0, import_cosmokit.isNullable)(value) || key in data) {
          result[key] = value;
        }
      }
      if (!strict) merge(result, data);
      return [result];
    });
    Schema2.extend("union", (data, { list, toString: toString2 }, options, strict) => {
      const messages = [];
      for (const inner of list) {
        try {
          return Schema2.resolve(data, inner, options, strict);
        } catch (error) {
          messages.push(error);
        }
      }
      throw new ValidationError(`expected ${toString2()} but got ${JSON.stringify(data)}`, options);
    });
    Schema2.extend("intersect", (data, { list, toString: toString2 }, options, strict) => {
      if (!list.length) return [data];
      let result;
      for (const inner of list) {
        const value = Schema2.resolve(data, inner, options, true)[0];
        if ((0, import_cosmokit.isNullable)(value)) continue;
        if ((0, import_cosmokit.isNullable)(result)) {
          result = value;
        } else if (typeof result !== typeof value) {
          throw new ValidationError(`expected ${toString2()} but got ${JSON.stringify(data)}`, options);
        } else if (typeof value === "object") {
          merge(result ??= {}, value);
        } else if (result !== value) {
          throw new ValidationError(`expected ${toString2()} but got ${JSON.stringify(data)}`, options);
        }
      }
      if (!strict && (0, import_cosmokit.isPlainObject)(data)) merge(result, data);
      return [result];
    });
    Schema2.extend("transform", (data, { inner, callback, preserve }, options) => {
      const [result, adapted = data] = Schema2.resolve(data, inner, options, true);
      if (preserve) {
        return [callback(result)];
      } else {
        return [callback(result), callback(adapted)];
      }
    });
    var formatters = {};
    function defineMethod(name2, keys, format) {
      formatters[name2] = format;
      Object.assign(Schema2, {
        [name2](...args) {
          const schema = new Schema2({ type: name2 });
          keys.forEach((key, index) => {
            switch (key) {
              case "sKey":
                schema.sKey = args[index] ?? Schema2.string();
                break;
              case "inner":
                schema.inner = Schema2.from(args[index]);
                break;
              case "list":
                schema.list = args[index].map(Schema2.from);
                break;
              case "dict":
                schema.dict = (0, import_cosmokit.valueMap)(args[index], Schema2.from);
                break;
              case "bits": {
                schema.bits = {};
                for (const key2 in args[index]) {
                  if (typeof args[index][key2] !== "number") continue;
                  schema.bits[key2] = args[index][key2];
                }
                break;
              }
              case "callback": {
                const callback = schema.callback = args[index];
                callback["toJSON"] ||= () => callback.toString();
                break;
              }
              case "constructor": {
                const constructor = schema.constructor = args[index];
                if (typeof constructor === "function") {
                  ;
                  constructor["toJSON"] ||= () => constructor["name"];
                }
                break;
              }
              default:
                schema[key] = args[index];
            }
          });
          if (name2 === "object" || name2 === "dict") {
            schema.meta.default = {};
          } else if (name2 === "array" || name2 === "tuple") {
            schema.meta.default = [];
          } else if (name2 === "bitset") {
            schema.meta.default = 0;
          }
          return schema;
        }
      });
    }
    __name(defineMethod, "defineMethod");
    defineMethod("is", ["constructor"], ({ constructor }) => {
      if (typeof constructor === "function") {
        return constructor.name;
      } else {
        return constructor;
      }
    });
    defineMethod("any", [], () => "any");
    defineMethod("never", [], () => "never");
    defineMethod("const", ["value"], ({ value }) => typeof value === "string" ? JSON.stringify(value) : value);
    defineMethod("string", [], () => "string");
    defineMethod("number", [], () => "number");
    defineMethod("boolean", [], () => "boolean");
    defineMethod("bitset", ["bits"], () => "bitset");
    defineMethod("function", [], () => "function");
    defineMethod("array", ["inner"], ({ inner }) => `${inner.toString(true)}[]`);
    defineMethod("dict", ["inner", "sKey"], ({ inner, sKey }) => `{ [key: ${sKey.toString()}]: ${inner.toString()} }`);
    defineMethod("tuple", ["list"], ({ list }) => `[${list.map((inner) => inner.toString()).join(", ")}]`);
    defineMethod("object", ["dict"], ({ dict }) => {
      if (Object.keys(dict).length === 0) return "{}";
      return `{ ${Object.entries(dict).map(([key, inner]) => {
        return `${key}${inner.meta.required ? "" : "?"}: ${inner.toString()}`;
      }).join(", ")} }`;
    });
    defineMethod("union", ["list"], ({ list }, inline) => {
      const result = list.map(({ toString: format }) => format()).join(" | ");
      return inline ? `(${result})` : result;
    });
    defineMethod("intersect", ["list"], ({ list }) => {
      return `${list.map((inner) => inner.toString(true)).join(" & ")}`;
    });
    defineMethod("transform", ["inner", "callback", "preserve"], ({ inner }, isInner) => inner.toString(isInner));
    module.exports = Schema2;
  }
});

// src/index.ts
import { BlockAssembler, createUserMessage } from "@deepseek-ai/dsh-llm";
import { deadline } from "@deepseek-ai/dsh-timeout";
import { appendFileSync, mkdirSync } from "node:fs";

// ../enpoi-memory/src/db.ts
import { DatabaseSync } from "node:sqlite";
import * as os from "node:os";
import * as path from "node:path";
var CATEGORIES = ["RULES", "ARCHITECTURE", "CONSTRAINTS", "CONFIG_VALUES", "NAMING", "PROJECT"];
var KEEPER_ALLOWED = /* @__PURE__ */ new Set(["ARCHITECTURE", "CONFIG_VALUES", "PROJECT"]);
function memoryDbPath() {
  return process.env.DSH_MEMORY_DB ?? path.join(os.homedir(), ".dsh", "memory.db");
}
var SCHEMA = `
CREATE TABLE IF NOT EXISTS claims (
  id TEXT PRIMARY KEY,
  fact TEXT NOT NULL,
  category TEXT NOT NULL,
  tags TEXT DEFAULT '',
  state TEXT NOT NULL CHECK (state IN ('tentative','committed','orphaned_cancelled','rescinded')),
  source_trust TEXT NOT NULL CHECK (source_trust IN ('operator','verified_execution','untrusted_external')),
  origin TEXT NOT NULL,
  provenance TEXT DEFAULT '',
  created_at INTEGER NOT NULL,
  committed_at INTEGER,
  supersedes TEXT,
  tombstone_reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_claims_state ON claims(state);
CREATE INDEX IF NOT EXISTS idx_claims_category ON claims(category);

CREATE VIRTUAL TABLE IF NOT EXISTS claims_fts USING fts5(
  fact, content='claims', content_rowid='rowid'
);

CREATE TRIGGER IF NOT EXISTS claims_ai AFTER INSERT ON claims BEGIN
  INSERT INTO claims_fts(rowid, fact) VALUES (new.rowid, new.fact);
END;
CREATE TRIGGER IF NOT EXISTS claims_ad AFTER DELETE ON claims BEGIN
  INSERT INTO claims_fts(claims_fts, rowid, fact) VALUES ('delete', old.rowid, old.fact);
END;
CREATE TRIGGER IF NOT EXISTS claims_au AFTER UPDATE ON claims BEGIN
  INSERT INTO claims_fts(claims_fts, rowid, fact) VALUES ('delete', old.rowid, old.fact);
  INSERT INTO claims_fts(rowid, fact) VALUES (new.rowid, new.fact);
END;
`;
function openMemoryDb() {
  const db = new DatabaseSync(memoryDbPath());
  db.exec("PRAGMA journal_mode=WAL;");
  db.exec("PRAGMA busy_timeout=5000;");
  db.exec(SCHEMA);
  return db;
}

// ../enpoi-memory/src/pipeline.ts
import { createHash } from "node:crypto";
var FACT_CAP = 400;
function claimHash(fact, category) {
  return createHash("sha256").update(`${fact}::${category}`).digest("hex").slice(0, 12);
}
var Mutex = class {
  chain = Promise.resolve();
  run(fn) {
    const run2 = this.chain.then(fn, fn);
    this.chain = run2.then(() => void 0, () => void 0);
    return run2;
  }
};
function makePipeline(db) {
  const mutex = new Mutex();
  function txn(fn) {
    db.exec("BEGIN IMMEDIATE");
    try {
      fn();
      db.exec("COMMIT");
    } catch (err) {
      try {
        db.exec("ROLLBACK");
      } catch {
      }
      throw err;
    }
  }
  function get(id) {
    return db.prepare("SELECT * FROM claims WHERE id = ?").get(id);
  }
  function stateOf(id) {
    return get(id)?.state;
  }
  async function intake(claims, opts) {
    return mutex.run(() => {
      const inserted = [];
      txn(() => {
        for (const c of claims) {
          const fact = String(c.fact ?? "").trim();
          if (fact.length === 0 || fact.length > FACT_CAP) continue;
          let category = String(c.category ?? "PROJECT").toUpperCase();
          if (!CATEGORIES.includes(category)) category = "PROJECT";
          if (opts.origin === "keeper" && !KEEPER_ALLOWED.has(category)) category = "PROJECT";
          const hash = claimHash(fact, category);
          const existing = db.prepare("SELECT * FROM claims WHERE id = ?").get(`claim-${hash}`);
          if (existing !== void 0) {
            if (existing.state === "rescinded") {
              continue;
            }
            if (opts.trust === "operator" && existing.state !== "committed") {
              db.prepare(`UPDATE claims SET state = 'committed', source_trust = 'operator', origin = ?, committed_at = ? WHERE id = ?`).run(opts.origin, Date.now(), existing.id);
              inserted.push(get(existing.id));
              continue;
            }
            if (existing.state === "orphaned_cancelled" && opts.trust === "verified_execution" && opts.parentAborted !== true) {
              db.prepare(`UPDATE claims SET state = 'committed', source_trust = ?, origin = ?, committed_at = ? WHERE id = ?`).run(opts.trust, opts.origin, Date.now(), existing.id);
              inserted.push(get(existing.id));
              continue;
            }
            continue;
          }
          const owner = db.prepare(
            `SELECT id FROM claims WHERE fact = ? AND state = 'committed' AND source_trust = 'operator' LIMIT 1`
          ).get(fact);
          if (owner !== void 0 && opts.trust !== "operator") {
            continue;
          }
          const state = opts.parentAborted ? "orphaned_cancelled" : opts.trust === "untrusted_external" ? "tentative" : "committed";
          const now = Date.now();
          db.prepare(
            `INSERT INTO claims (id, fact, category, tags, state, source_trust, origin, provenance, created_at, committed_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).run(
            `claim-${hash}`,
            fact,
            category,
            c.tags ?? "",
            state,
            opts.trust === "verified_execution" || opts.trust === "operator" ? opts.trust : "untrusted_external",
            opts.origin,
            opts.provenance ?? "",
            now,
            state === "committed" ? now : null
          );
          inserted.push(get(`claim-${hash}`));
        }
      });
      return inserted;
    });
  }
  async function graduate(id) {
    return mutex.run(() => {
      let out = null;
      txn(() => {
        const row = get(id);
        if (row === void 0 || row.state !== "tentative") return;
        db.prepare(`UPDATE claims SET state = 'committed', committed_at = ? WHERE id = ?`).run(Date.now(), id);
        out = get(id) ?? null;
      });
      return out;
    });
  }
  async function confirm(id) {
    const row = get(id);
    if (row === void 0) return null;
    return graduate(id);
  }
  async function rescind(id, reason) {
    return mutex.run(() => {
      let changed = false;
      txn(() => {
        const row = get(id);
        if (row === void 0) return;
        db.prepare(`UPDATE claims SET state = 'rescinded', tombstone_reason = ? WHERE id = ?`).run(reason ?? "", id);
        changed = true;
      });
      return changed;
    });
  }
  async function reconcileBoot() {
    return mutex.run(() => {
      let n = 0;
      txn(() => {
        const res = db.prepare(`UPDATE claims SET state = 'orphaned_cancelled' WHERE state = 'tentative'`).run();
        n = Number(res?.changes ?? 0);
      });
      return n;
    });
  }
  function list(filter) {
    if (filter?.category !== void 0 && filter?.state !== void 0) {
      return db.prepare(`SELECT * FROM claims WHERE category = ? AND state = ? ORDER BY created_at DESC`).all(filter.category, filter.state);
    }
    if (filter?.category !== void 0) {
      return db.prepare(`SELECT * FROM claims WHERE category = ? ORDER BY created_at DESC`).all(filter.category);
    }
    if (filter?.state !== void 0) {
      return db.prepare(`SELECT * FROM claims WHERE state = ? ORDER BY created_at DESC`).all(filter.state);
    }
    return db.prepare(`SELECT * FROM claims ORDER BY created_at DESC LIMIT 200`).all();
  }
  return { intake, graduate, confirm, rescind, reconcileBoot, list, get, stateOf };
}

// src/index.ts
var import_schemastery = __toESM(require_lib2(), 1);
import { join as join2 } from "node:path";
var name = "enpoi-context-keeper";
var inject = ["llm"];
function diag(line) {
  try {
    const home = process.env.DSH_HOME ?? process.env.HOME ?? "/tmp";
    const dir = join2(home.endsWith(".dsh") ? home : join2(home, ".dsh"), "logs");
    mkdirSync(dir, { recursive: true });
    appendFileSync(join2(dir, "enpoi-keeper.log"), `${(/* @__PURE__ */ new Date()).toISOString()} ${line}
`);
  } catch {
  }
}
var Config = import_schemastery.default.object({
  provider: import_schemastery.default.string().default("opencode"),
  model: import_schemastery.default.string().default("mimo-v2.5-free"),
  fallbackProvider: import_schemastery.default.string().default("antigravity"),
  fallbackModel: import_schemastery.default.string().default("gemini-3.7-flash-tiered"),
  debounceMs: import_schemastery.default.number().default(3e4),
  leaseMs: import_schemastery.default.number().default(45e3),
  maxInputEvents: import_schemastery.default.number().default(80),
  maxOutputTokens: import_schemastery.default.number().default(2048)
});
var SYSTEM_PROMPT = [
  "You are the Enpoi Harness context keeper \u2014 the master background summarizer and architectural keeper for this coding session.",
  "You maintain a running, rich, and highly comprehensive Living Brief of the session for later dispatch to subagent workers, the Oracle, Council debaters, and permanent memory.",
  "If a [PREVIOUS SESSION BRIEF] is provided, incrementally merge it with the [RECENT SESSION EVENTS & TOOL RESULTS] (including Council/Roundtable consensus, Oracle verdicts, subagent returns, tool results, documentation paths, and user directives).",
  "NEVER extract, repeat, or retain credentials, passwords, API keys, tokens, or personal secrets.",
  "",
  "You have ONE background tool: memory_save. Use it via the CLAIMS block below.",
  "",
  "Output EXACTLY two blocks, IN THIS ORDER (no other text at all):",
  "",
  "BLOCK 1 \u2014 PROSE:",
  "Generate an exhaustive, highly structured, multi-section Living Brief using these exact section headers:",
  "\u{1F3AF} ACTIVE GOAL & CORE TRAJECTORY:",
  "- Current active objective, user directives, and high-level technical paradigms.",
  "",
  "\u{1F4DA} DOCUMENTATION & SPECIFICATIONS INVENTORY:",
  '- List all documentation, plans, architectures, and spec files written, modified, or referenced in the session (e.g. file paths like ~/dsh-migration/*.md, docs/*.md, ARCHITECTURE.md, etc.) with a 1-line summary of what each covers ("free context" for agents).',
  "",
  "\u{1F3DB}\uFE0F ARCHITECTURAL INVARIANTS & CONCRETE DECISIONS:",
  "- Concrete technical decisions established in the session (especially from Council, Oracle, and tool results): exact component boundaries, protocols (IPC/HTTP/WS/Redis), data keys/schemas, state machines, and concurrency rules.",
  "",
  "\u{1F6AB} REJECTED APPROACHES & EDGE CASES:",
  "- Approaches debated and explicitly ruled out (and the reasons why), edge cases handled, and failure modes defended.",
  "",
  "\u26A1 ACTIVE BLOCKERS & OPEN QUESTIONS:",
  "- Unresolved technical questions, pending implementation tasks, or immediate next steps.",
  "",
  "BLOCK 2 \u2014 CLAIMS:",
  'A line starting with "CLAIMS:" followed by a JSON array of permanent facts you are SAVING to memory.db: [{"fact":"...","category":"ARCHITECTURE","tags":"..."}]',
  "  - File 2\u20134 durable facts about Adam's environment/infrastructure/architecture whenever the session surfaces them.",
  "  - Categories limited to ARCHITECTURE, CONFIG_VALUES, or PROJECT.",
  "  - NO credentials/passwords/tokens/secrets; skip transient chatter."
].join("\n");
function apply(ctx, config) {
  const states = /* @__PURE__ */ new Map();
  diag(`apply: mounted (provider=${config.provider}/${config.model}, debounce=${config.debounceMs}ms, lease=${config.leaseMs}ms)`);
  ctx.on("session/event", (session, event) => {
    if (event.type !== "turn/end") return;
    const reason = event.data.reason;
    if (reason.kind === "aborted") return;
    diag(`turn/end: session=${session.id} turn=${event.data.turn} reason=${reason.kind} \u2014 arming`);
    arm(ctx, config, states, session, event.data.turn);
  });
  ctx.on("dispose", () => {
    for (const state of states.values()) {
      if (state.timer !== null) clearTimeout(state.timer);
    }
    states.clear();
  });
}
function arm(ctx, config, states, session, turn) {
  const key = session.id;
  const existing = states.get(key);
  if (existing !== void 0 && existing.timer !== null) clearTimeout(existing.timer);
  const timer = setTimeout(() => {
    void run(ctx, config, states, session, turn);
  }, config.debounceMs);
  states.set(key, { timer, running: existing?.running ?? false, turn });
}
async function run(ctx, config, states, session, turn) {
  const key = session.id;
  const state = states.get(key);
  if (state === void 0) return;
  state.timer = null;
  if (state.running) return;
  state.running = true;
  const lease = new AbortController();
  const leaseTimer = setTimeout(() => lease.abort(), config.leaseMs);
  try {
    const input = frameInput(session, config.maxInputEvents);
    if (input.length === 0) {
      diag(`run: session=${session.id} turn=${turn} \u2014 empty input, skipping`);
      return;
    }
    diag(`run: session=${session.id} turn=${turn} \u2014 calling LLM (input ${input.length} chars)`);
    const snapshotSeq = session.events.at(-1)?.seq ?? session.seq;
    const result = await summarize(ctx, config, session, input, lease.signal);
    if (result.text.length === 0) {
      diag(`run: session=${session.id} turn=${turn} \u2014 empty summary, skipping`);
      return;
    }
    diag(`run: session=${session.id} turn=${turn} \u2014 raw output: ${result.text.slice(0, 1200).replace(/\n/g, " | ")}`);
    const { prose, claims } = splitProseClaims(result.text);
    if (prose.length === 0) {
      diag(`run: session=${session.id} turn=${turn} \u2014 empty prose, skipping`);
      return;
    }
    session.append("brief/prose-updated", {
      basedOnSeq: snapshotSeq,
      model: result.route,
      text: prose,
      origin: "context-keeper"
    });
    diag(`run: session=${session.id} turn=${turn} \u2014 appended brief/prose-updated via ${result.route} (${prose.length} chars, ${claims.length} claims)`);
    ctx.logger.info(`enpoi-context-keeper: brief updated for session ${session.id} (turn ${turn})`);
    if (claims.length > 0) {
      try {
        const memDb = openMemoryDb();
        const mem = makePipeline(memDb);
        const inserted = await mem.intake(
          claims.map((c) => ({ fact: c.fact, category: c.category, tags: c.tags })),
          { origin: "keeper", trust: "verified_execution", provenance: JSON.stringify({ sessionId: session.id, turn }) }
        );
        diag(`run: session=${session.id} turn=${turn} \u2014 memory intake: ${inserted.length} claim(s) filed`);
      } catch (err) {
        diag(`run: session=${session.id} turn=${turn} \u2014 memory intake FAILED: ${String(err)}`);
      }
    }
  } catch (error) {
    if (lease.signal.aborted) {
      diag(`run: session=${session.id} turn=${turn} \u2014 KEEPER_TIMEOUT`);
      ctx.logger.warn(`enpoi-context-keeper: KEEPER_TIMEOUT session ${session.id} (turn ${turn})`);
    } else {
      diag(`run: session=${session.id} turn=${turn} \u2014 ERROR ${String(error)}`);
      ctx.logger.warn(`enpoi-context-keeper: ${String(error)} (session ${session.id}, turn ${turn})`);
    }
  } finally {
    clearTimeout(leaseTimer);
    state.running = false;
  }
}
function splitProseClaims(text) {
  const idx = text.indexOf("CLAIMS:");
  if (idx === -1) return { prose: text.trim(), claims: [] };
  const prose = text.slice(0, idx).replace(/^PROSE\s*:/m, "").trim();
  const jsonPart = text.slice(idx + "CLAIMS:".length).trim();
  try {
    const m = jsonPart.match(/\[[\s\S]*\]/);
    if (m === null) return { prose, claims: [] };
    const arr = JSON.parse(m[0]);
    if (!Array.isArray(arr)) return { prose, claims: [] };
    const claims = arr.filter((c) => typeof c === "object" && c !== null && typeof c.fact === "string").map((c) => ({
      fact: String(c.fact).trim().slice(0, 300),
      category: String(c.category ?? "PROJECT").slice(0, 32),
      tags: typeof c.tags === "string" ? c.tags : void 0
    })).filter((c) => c.fact.length > 0);
    return { prose, claims };
  } catch {
    diag("splitProseClaims: CLAIMS JSON parse failed (isolated, prose kept)");
    return { prose, claims: [] };
  }
}
function frameInput(session, maxEvents) {
  const events = session.events;
  let previousProse = "";
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.type === "brief/prose-updated") {
      const data = e.data;
      if (typeof data.text === "string" && data.text.length > 0) {
        previousProse = data.text.slice(0, 4e3);
        break;
      }
    }
  }
  const start = Math.max(0, events.length - maxEvents);
  const lines = [];
  const docFiles = /* @__PURE__ */ new Set();
  for (let i = start; i < events.length; i++) {
    const event = events[i];
    if (event.type === "user/message") {
      const text = messageText(event.data.content);
      if (text.length > 0) lines.push(`USER: ${text.slice(0, 2500)}`);
    } else if (event.type === "assistant/message") {
      const data = event.data;
      if (typeof data.text === "string" && data.text.length > 0) {
        lines.push(`ASSISTANT: ${data.text.slice(0, 2500)}`);
      }
    } else if (event.type === "tool/call") {
      const data = event.data;
      const argsStr = typeof data.arguments === "string" && data.arguments.length > 0 ? ` ${data.arguments.slice(0, 600)}` : "";
      lines.push(`TOOL CALL: ${data.name}${argsStr}`);
      if (data.arguments) {
        const matches = data.arguments.match(/["']([^"']*\.(?:md|json|yaml|yml))["']/g);
        if (matches) {
          for (const m of matches) {
            const clean = m.replace(/["']/g, "");
            if (clean.length > 2) docFiles.add(clean);
          }
        }
      }
    } else if (event.type === "tool/result") {
      const resultText = toolResultText(event.data);
      if (resultText.length > 0) {
        lines.push(`TOOL RESULT: ${resultText.slice(0, 4e3)}`);
      }
    }
  }
  const sections = [];
  if (previousProse.length > 0) {
    sections.push(`--- PREVIOUS SESSION BRIEF ---
${previousProse}`);
  }
  if (docFiles.size > 0) {
    sections.push(`--- RECENT SPECIFICATION & DOCUMENTATION FILES ---
${Array.from(docFiles).map((f) => `\u2022 ${f}`).join("\n")}`);
  }
  if (lines.length > 0) {
    sections.push(`--- RECENT SESSION EVENTS & TOOL RESULTS ---
${lines.join("\n")}`);
  }
  return sections.join("\n\n");
}
function toolResultText(data) {
  if (!data || typeof data !== "object") return "";
  const d = data;
  if (d.error?.message) return `Error: ${d.error.message}`;
  if (!d.message || !Array.isArray(d.message.content)) return "";
  const parts = [];
  for (const block of d.message.content) {
    if (typeof block === "string") parts.push(block);
    else if (block && typeof block === "object") {
      const b = block;
      if (typeof b.text === "string") parts.push(b.text);
      if (Array.isArray(b.content)) {
        for (const sub of b.content) {
          if (typeof sub === "string") parts.push(sub);
          else if (sub && typeof sub === "object" && typeof sub.text === "string") {
            parts.push(sub.text);
          }
        }
      }
    }
  }
  return parts.filter(Boolean).join(" ").trim();
}
function messageText(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((part) => {
      if (typeof part === "string") return part;
      if (part !== null && typeof part === "object" && "text" in part && typeof part.text === "string") {
        return part.text;
      }
      return "";
    }).filter((text) => text.length > 0).join(" ");
  }
  return "";
}
function validateKeeperOutput(text, finishKind) {
  if (finishKind === "max-tokens") {
    return { valid: false, reason: "Stream truncated by maxOutputTokens limit" };
  }
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return { valid: false, reason: "Empty output received from model" };
  }
  const claimsMatch = trimmed.match(/CLAIMS:\s*([\s\S]*)$/i);
  if (claimsMatch) {
    const rawClaims = claimsMatch[1].trim();
    if (/^(none|n\/a|\[\s*\])$/i.test(rawClaims)) {
      return { valid: true };
    }
    const jsonMatch = rawClaims.match(/\[[\s\S]*?\]/);
    if (!jsonMatch) {
      return { valid: false, reason: "CLAIMS tag present but JSON array was truncated/unclosed" };
    }
    try {
      JSON.parse(jsonMatch[0]);
    } catch (e) {
      return { valid: false, reason: `Malformed CLAIMS JSON: ${String(e)}` };
    }
  }
  return { valid: true };
}
async function summarize(ctx, config, session, input, signal) {
  const messages = [createUserMessage({
    content: [{ type: "text", text: input }],
    source: { kind: "plugin", plugin: "enpoi-context-keeper" }
  })];
  const base = {
    provider: config.provider,
    model: config.model,
    messages,
    system: SYSTEM_PROMPT,
    maxTokens: config.maxOutputTokens,
    sessionId: session.id,
    purpose: "context-keeper",
    signal
  };
  async function executeRoute(provider, model) {
    const result = await streamTextWithMeta(ctx, { ...base, provider, model });
    const validation = validateKeeperOutput(result.text, result.finishKind);
    if (!validation.valid) {
      throw new Error(`Output invalid/truncated on ${provider}/${model}: ${validation.reason}`);
    }
    return result.text;
  }
  try {
    const text = await executeRoute(config.provider, config.model);
    return { text, route: `${config.provider}/${config.model}` };
  } catch (error) {
    if (signal.aborted) throw error;
    ctx.logger.warn(`enpoi-context-keeper: primary route failed/cut off (${String(error)}), trying fallback`);
    diag(`primary route failed/cut off (${String(error)}), switching to fallback ${config.fallbackProvider}/${config.fallbackModel}`);
    try {
      const fallbackText = await executeRoute(config.fallbackProvider, config.fallbackModel);
      return {
        text: fallbackText,
        route: `${config.fallbackProvider}/${config.fallbackModel}`
      };
    } catch (fallbackError) {
      if (signal.aborted) throw fallbackError;
      throw new Error(`enpoi-context-keeper: all summary routes failed. Primary: ${String(error)}, Fallback: ${String(fallbackError)}`);
    }
  }
}
async function streamTextWithMeta(ctx, options) {
  var _stack = [];
  try {
    const callDeadline = __using(_stack, deadline(options.signal, 4e4, "ENPOI_KEEPER_STREAM_TIMEOUT"));
    const assembler = new BlockAssembler();
    for await (const chunk of ctx.llm.stream({ ...options, signal: callDeadline.signal })) {
      callDeadline.signal.throwIfAborted();
      assembler.push(chunk);
    }
    callDeadline.signal.throwIfAborted();
    const terminalError = finishError(assembler.finish);
    if (terminalError !== void 0) throw terminalError;
    const blocks = assembler.blocks();
    const text = blocks.filter((block) => block.type === "text").map((block) => block.text).join(" ").trim();
    return { text, finishKind: assembler.finish.kind };
  } catch (_) {
    var _error = _, _hasError = true;
  } finally {
    __callDispose(_stack, _error, _hasError);
  }
}
function finishError(finish) {
  switch (finish.kind) {
    case "stop":
      return void 0;
    case "error":
    case "aborted": {
      const failure = finish.failure ?? { message: "unknown failure", code: "UNKNOWN" };
      const error = new Error(failure.message);
      error.code = failure.code;
      return error;
    }
    case "max-tokens":
      return new Error("enpoi-context-keeper: summary output reached maxOutputTokens");
    case "tool-calls":
      return new Error("enpoi-context-keeper: summarizer unexpectedly requested a tool");
    default:
      return void 0;
  }
}
export {
  Config,
  apply,
  inject,
  name
};
