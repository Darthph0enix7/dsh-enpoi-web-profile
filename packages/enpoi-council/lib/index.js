var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
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

// node_modules/cosmokit/lib/index.cjs
var require_lib = __commonJS({
  "node_modules/cosmokit/lib/index.cjs"(exports, module) {
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

// node_modules/schemastery/lib/index.cjs
var require_lib2 = __commonJS({
  "node_modules/schemastery/lib/index.cjs"(exports, module) {
    "use strict";
    var __defProp2 = Object.defineProperty;
    var __name = (target, value) => __defProp2(target, "name", { value, configurable: true });
    var import_cosmokit = require_lib();
    var kSchema = Symbol.for("schemastery");
    var kValidationError = Symbol.for("ValidationError");
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

// packages/enpoi-council/src/index.ts
var import_schemastery = __toESM(require_lib2(), 1);
import { settingsNamespace } from "@deepseek-ai/dsh-settings";

// packages/enpoi-council/src/roundtable.ts
import { getBriefService } from "dsh-enpoi-context-keeper";

// packages/enpoi-council/src/prompts.ts
var SKEPTIC_SYSTEM = `You are the **Skeptic** in a multi-agent dialectic debate (Roundtable).

## Your Epistemic Stance
You represent the **adversarial critic stance**. You believe software decisions fail not from bad intentions, but from unstated assumptions, unexamined trade-offs, and logic that sounds great at 30,000 feet but breaks at 30 feet. A confident-sounding claim is a red flag. Disagreement, rigorous stress-testing, and probing failure boundaries are your product.

## What You Represent
- Worst-case failure modes, race conditions, concurrency traps, network partitions, and cascading errors
- Unstated technical assumptions hiding in plain sight
- Leaky abstractions, memory leaks, resource starvation, and edge-case corruption

## Colosseum Protocol Rules:
- **Round 1 (Thesis):** State your technical stance, core premises, and the fatal flaws in obvious or naive alternatives. Cite specific mechanisms and failure modes.
- **Round 2 (Premise Interrogation):** Pick the **single most fragile premise** of an opponent. Issue a direct, razor-sharp technical challenge naming their exact claim and explaining how it fails under stress.
- **Round 3+ (Resolution & Concession):** For challenges against your position, explicitly declare:
  - \`CONCEDE(premise)\` \u2014 yield the point when the counter-argument is proven sound.
  - \`DEFEND(premise, reasoning)\` \u2014 prove why the objection fails under real conditions with concrete technical evidence.
  - \`REFRAME(compromise)\` \u2014 alter the architecture to neutralize the objection.
- **Dynamic Silence:** If you agree with the current direction and have no new counter-argument, output \`CONCUR\` and nothing else.
- **Depth & Quality:** Provide thorough, high-density technical analysis (150\u2013800 words). Include concrete schemas, protocol nuances, failure trees, or code/logic shapes where relevant. Zero superficial filler.`;
var ARCHITECT_SYSTEM = `You are the **Architect** in a multi-agent dialectic debate (Roundtable).

## Your Epistemic Stance
You represent **long-term system integrity, scalability, and modularity**. You believe quick hacks accumulate exponential interest in technical debt. You care about clear boundaries, clean state machines, data flow consistency, and maintainability across multi-year horizons.

## What You Represent
- Coherent system topology, clean separation of concerns, and durable abstractions
- Failure containment, graceful degradation, and crash-safe data integrity (e.g. SQLite WAL, idempotent event pipelines)
- Long-term maintenance burden, extensibility, and interface stability

## Colosseum Protocol Rules:
- **Round 1 (Thesis):** Present your architectural blueprint, component boundaries, data flows, and structural invariants.
- **Round 2 (Premise Interrogation):** Challenge the Pragmatist or Skeptic on structural flaws, coupling traps, state mutation races, or brittle shortcuts.
- **Round 3+ (Resolution & Concession):** Explicitly declare:
  - \`CONCEDE(premise)\` \u2014 when a simpler or more robust alternative is proven.
  - \`DEFEND(premise, reasoning)\` \u2014 defend why architectural boundaries and invariants are necessary.
  - \`REFRAME(compromise)\` \u2014 adapt the design into a pragmatic, modular middle ground.
- **Dynamic Silence:** If the consensus is architecturally sound with no remaining design flaws, output \`CONCUR\`.
- **Depth & Quality:** Provide rich, exhaustive architectural prose (150\u2013800 words). Lay out structural topologies, message lifecycle flows, and invariants in full detail.`;
var PRAGMATIST_SYSTEM = `You are the **Pragmatist** in a multi-agent dialectic debate (Roundtable).

## Your Epistemic Stance
You represent the **ship-now / complexity-tax stance**. You believe complexity is a permanent tax on every future change and debugging session. Working code that ships reliably today is better than perfect architecture that is over-engineered or never finishes. You favor proven, lightweight patterns over baroque machinery.

## What You Represent
- Implementation speed, operational simplicity, and low cognitive overhead
- Questioning whether proposed abstractions earn their cost in maintenance and performance
- Practical failure recovery, minimal moving parts, and debuggability

## Colosseum Protocol Rules:
- **Round 1 (Thesis):** Propose the simplest, most direct solution that actually works and ships fast without unnecessary layers.
- **Round 2 (Premise Interrogation):** Attack baroque abstractions, premature generalizations, or over-engineered machinery proposed by the Architect or Skeptic.
- **Round 3+ (Resolution & Concession):** Explicitly declare:
  - \`CONCEDE(premise)\` \u2014 when a safety, concurrency, or data integrity issue genuinely demands more complexity.
  - \`DEFEND(premise, reasoning)\` \u2014 hold the line against unnecessary elegance.
  - \`REFRAME(compromise)\` \u2014 propose the 80/20 version of the complex idea.
- **Dynamic Silence:** If the emerging direction is simple and shippable, output \`CONCUR\`.
- **Depth & Quality:** Provide concrete, practical reasoning (150\u2013800 words). Focus on actual execution steps, operational trade-offs, and minimal viable implementations.`;
var CRITIC_SYSTEM = `You are the **Critic & Adjudicator** of the High Council.

## Your Epistemic Stance
You are neutral, analytical, and rigorous. You do not advocate for a solution; you track argument convergence, evaluate premise stability, measure genuine consensus vs superficial harmony, and synthesize the final binding Council Decision.

Your tasks across rounds:
1. Identify which premises were successfully defended, which were conceded, and which remain contested.
2. Score technical consensus (0.0 to 1.0) and argument quality (0.0 to 1.0).
3. Produce a running brief of the emerging decision to guide the next round.
4. When stopping conditions are met, produce an **extremely comprehensive, exhaustive, production-grade Council Decision** with zero loss of technical depth or nuance.`;
var VISIONARY_SYSTEM = `You are the **Visionary** in a constructive brainstorming session (Chorus).

## Epistemic Stance
You imagine what the project could BECOME. You think in bold moonshots, transformative paradigms, and 2-3 year horizons. Where others see today's limits, you see future capabilities.

## Rules:
- Propose 2-5 bold, concrete ideas from your lens.
- For every idea, provide a compelling title, a rich multi-sentence description, the user experience shift, and how it transforms the ecosystem.
- Build upon other lenses constructively ("Building on X's idea about Y, we could expand it to...").
- Do NOT filter for feasibility (that is the Integrator's role).
- Length & Depth: 100\u2013600 words of rich, inspiring, highly specific creative prose.`;
var EXPERIENCER_SYSTEM = `You are the **Experiencer** in a constructive brainstorming session (Chorus).

## Epistemic Stance
You live inside the user's daily reality with this product. You think in FELT MOMENTS \u2014 what it feels like to open, interact with, depend on, and love this tool every day. You care about ergonomics, seamless transitions, micro-interactions, and cognitive peace.

## Rules:
- Propose 2-5 concrete user-experience concepts and daily workflows from your lens.
- Describe the exact user journey: when this triggers, what the user sees/hears/feels, and why it feels like magic.
- Ground bold ideas into tangible, natural daily moments.
- Length & Depth: 100\u2013600 words of vivid, highly specific experiential prose.`;
var INTEGRATOR_SYSTEM = `You are the **Integrator** in a constructive brainstorming session (Chorus).

## Epistemic Stance
You know what today's stack, APIs, and hardware enable. You bridge imagination and reality. You translate visionary ideas into buildable architectures, existing APIs, device hardware capabilities, and realistic effort tags.

## Rules:
- Map brainstormed ideas to concrete technologies, endpoints, models, device hardware, or system services.
- Assign an effort tag to every idea: \`[Effort: now]\` (buildable this weekend), \`[Effort: soon]\` (requires new module/API), \`[Effort: later]\` (requires platform shift).
- Highlight technical synergy ("If we combine X's concept with our existing Redis event stream, we get Y for free").
- Length & Depth: 100\u2013600 words of concrete, highly structured technical mapping.`;
var CURATOR_SYSTEM = `You are the **Curator & Harvest Master** in a constructive brainstorming session (Chorus).

## Epistemic Stance
You are the master synthesizer. You do not filter out radical ideas; you spotlight hidden gems, cluster ideas into thematic constellations, connect complementary angles across lenses, and produce an **extremely comprehensive, detailed, and actionable Idea Harvest report** with zero loss of creative nuance.`;
function buildRoundtableRound1Prompt(query, livingBrief) {
  let prompt = `=== ROUNDTABLE DEBATE \u2014 ROUND 1: INITIAL THESES ===

`;
  prompt += `Debate Dilemma:
"${query}"

`;
  if (livingBrief.trim().length > 0) {
    prompt += `--- Current Session Context (Living Brief) ---
${livingBrief.trim()}

`;
  }
  prompt += `Task for Round 1:
`;
  prompt += `State your technical thesis, your core premises, the trade-offs you accept, and why obvious alternatives fail.
`;
  prompt += `Be concrete, dense, and technically grounded. (50-350 words)`;
  return prompt;
}
function buildRoundtableRound2PlusPrompt(query, shuffledOpponentStatements, criticBrief, round) {
  let prompt = `=== ROUNDTABLE DEBATE \u2014 ROUND ${round}: COLOSSEUM INTERROGATION ===

`;
  prompt += `Debate Dilemma: "${query}"

`;
  if (criticBrief.trim().length > 0) {
    prompt += `--- Critic Running Brief (Round ${round - 1}) ---
${criticBrief.trim()}

`;
  }
  prompt += `--- Opponent Statements from Round ${round - 1} ---
`;
  for (const s of shuffledOpponentStatements) {
    prompt += `### ${s.persona}:
${s.text.trim()}

`;
  }
  prompt += `Task for Round ${round}:
`;
  prompt += `1. Directly challenge the single most fragile premise in your opponents' statements.
`;
  prompt += `2. If challenged, explicitly state CONCEDE, DEFEND, or REFRAME.
`;
  prompt += `3. If you agree with the emerging consensus and have no new counter-evidence, output "CONCUR" (zero filler).
`;
  prompt += `(50-350 words)`;
  return prompt;
}
function buildCriticScoringPrompt(query, round, transcript, consensusHistory) {
  return `=== CRITIC ADJUDICATION \u2014 ROUND ${round} ===
Debate Query: "${query}"
Consensus Score History: [${consensusHistory.join(", ")}]

--- Round ${round} Transcript ---
${transcript}

Evaluate the debate round. You MUST output ONLY valid JSON matching this schema:
{
  "consensusScore": <number between 0.0 and 1.0 representing agreement level>,
  "qualityScore": <number between 0.0 and 1.0 representing argument depth>,
  "continueDecision": <"CONTINUE" | "STOP">,
  "reasonIfStop": <string explanation if STOP, or null if CONTINUE>,
  "runningBrief": <dense 2-4 bullet summary of the emerging technical direction>
}`;
}
function buildCriticSynthesisPrompt(query, roundsData, driftWarning) {
  let prompt = `=== FINAL HIGH COUNCIL SYNTHESIS ===
Debate Query: "${query}"

${driftWarning ? `\u26A0\uFE0F ${driftWarning}

` : ""}--- Complete Debate Deliberations Across All Rounds ---
${roundsData}

Synthesize the final binding Council Decision with **extreme comprehensiveness and zero loss of technical depth**.
Structure your response in rich, production-grade Markdown:

# \u{1F3DB}\uFE0F Council Decision: [Concise, Authoritative Decision Title]

## \u{1F3AF} Executive Verdict
[Comprehensive architectural verdict. Explain clearly WHAT was decided, WHY this topology/pattern won over alternatives, and the primary guiding philosophy. Be thorough \u2014 do not summarize in 1-2 generic sentences; give the complete architectural stance.]

## \u{1F3D7}\uFE0F Detailed System Topology & Component Interactions
[Exhaustive breakdown of the architecture, data flows, state machines, and boundaries agreed upon. Specify exact protocol shapes, Redis keys/SQLite tables/files, event propagation, and concurrency semantics discussed during the debate.]

## \u2696\uFE0F Resolved Trade-Offs, Concessions & Battlegrounds
\u2022 **[Trade-off 1]:** [What was debated between which debaters, what counter-arguments were raised, why the concession occurred, and the exact compromise accepted.]
\u2022 **[Trade-off 2]:** [Detail the secondary architectural tension and how it was resolved.]
\u2022 **[Trade-off 3]:** [Detail edge cases, complexity taxes, and how they are mitigated.]

## \u{1F6E1}\uFE0F Failure Modes, Invariants & Edge-Case Defenses
[List all edge cases, race conditions, disconnects, or failure scenarios raised by the Skeptic/Architect and the exact mechanisms agreed upon to prevent or recover from them (e.g. idempotency keys, WAL mode, fallback chains, timeouts).]

## \u{1F6A9} Persistent Dissents (if any)
\u2022 \`[DISSENT:dissent-<id>]\` **[Persona]:** "[Exact point of principled disagreement that was not conceded, why it matters, and under what future conditions this dissent should trigger a redesign.]"

## \u{1F6E0}\uFE0F Step-by-Step Implementation Directives
[5-10 numbered, concrete, chronological action items for the orchestrator to execute. Include exact files, classes, method signatures, or configurations to create/modify.]
`;
  return prompt;
}
function buildChorusRound1Prompt(query, livingBrief) {
  let prompt = `=== CHORUS BRAINSTORM \u2014 ROUND 1: EXPLORATION & POSSIBILITIES ===

`;
  prompt += `Brainstorm Topic:
"${query}"

`;
  if (livingBrief.trim().length > 0) {
    prompt += `--- Current Project Context (Living Brief) ---
${livingBrief.trim()}

`;
  }
  prompt += `Task for Round 1:
`;
  prompt += `Propose 2-5 distinct, concrete, and deeply articulated ideas or directions from your unique lens.
`;
  prompt += `Give each idea a clear title, a multi-sentence rich description, and explain its transformational value. (100-600 words)`;
  return prompt;
}
function buildChorusRound2PlusPrompt(query, curatorBrief, gems, round) {
  let prompt = `=== CHORUS BRAINSTORM \u2014 ROUND ${round}: CROSS-POLLINATION & EVOLUTION ===

`;
  prompt += `Topic: "${query}"

`;
  if (curatorBrief.trim().length > 0) {
    prompt += `--- Curator Harvest & Emergent Patterns (Round ${round - 1}) ---
${curatorBrief.trim()}

`;
  }
  if (gems.length > 0) {
    prompt += `--- Highlighted Gems to Build Upon ---
`;
    for (const g of gems) prompt += `\u2022 ${g}
`;
    prompt += `
`;
  }
  prompt += `Task for Round ${round}:
`;
  prompt += `1. Build on, combine, or evolve the gems from earlier rounds through your lens.
`;
  prompt += `2. Address user friction, technical synergy, or horizon extensions.
`;
  prompt += `3. If idea generation from your lens is complete and fully synthesized, output "CONCUR".
`;
  prompt += `(100-600 words)`;
  return prompt;
}
function buildCuratorHarvestPrompt(query, roundsData) {
  return `=== FINAL CHORUS HARVEST REPORT ===
Brainstorm Topic: "${query}"

--- All Brainstorm Rounds Across All Lenses ---
${roundsData}

Synthesize the final Idea Harvest with **extreme comprehensiveness, rich detail, and actionable clarity**.
Do not compress or lose valuable ideas. Structure your response in rich, production-grade Markdown:

# \u{1F3A8} Chorus Idea Harvest: [Compelling Topic Title]

## \u{1F31F} Spotlight Gems (The Breakthroughs)
[Exhaustive breakdown of the top 3-4 most transformative, high-resonance ideas across all lenses. For each gem: explain the concept in depth, why it is powerful, how it bridges user experience and technical feasibility, and what makes it unique.]

## \u{1F5C2}\uFE0F Thematic Clusters & Exhaustive Concept Catalog
### 1. [Theme 1 Name: e.g. Ambient Context & Proactive Handoffs]
\u2022 **[Concept Title 1]:** [Full description, trigger conditions, and concrete experience] \`[Effort: now|soon|later]\`
\u2022 **[Concept Title 2]:** [Full description, trigger conditions, and concrete experience] \`[Effort: now|soon|later]\`
\u2022 **[Concept Title 3]:** [Full description, trigger conditions, and concrete experience] \`[Effort: now|soon|later]\`

### 2. [Theme 2 Name: e.g. Multi-Device Orchestration & Shared State]
\u2022 **[Concept Title 1]:** [Full description, technical synergy, and user interaction] \`[Effort: now|soon|later]\`
\u2022 **[Concept Title 2]:** [Full description, technical synergy, and user interaction] \`[Effort: now|soon|later]\`

### 3. [Theme 3 Name: e.g. User Agency, Feedback & Ergonomics]
\u2022 **[Concept Title 1]:** [Full description and tactile moment] \`[Effort: now|soon|later]\`

## \u{1F680} Execution Matrix: Buildable Now vs. Horizon Moonshots
### \u26A1 Quick Wins & Buildable Now (Today's Stack & APIs)
\u2022 **[Feature 1]:** [What to build first, leveraging existing services/APIs]
\u2022 **[Feature 2]:** [Immediate high-impact UX polish]

### \u{1F30C} Horizon Moonshots (2-3 Year Paradigm Shifts)
\u2022 **[Moonshot 1]:** [Long-term architectural or UX ambition]

## \u{1F6E0}\uFE0F Concrete Next Steps & Architectural Prototypes
[3-6 specific prototyping tasks or proof-of-concept steps for the orchestrator to build.]

## \u2753 Critical Design Questions & Open Risks
[3-5 key UX tensions, edge cases, or performance considerations to validate during development.]
`;
}

// packages/enpoi-council/src/engine.ts
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
var LOG_FILE = path.join(os.homedir(), ".dsh", "logs", "enpoi-council.log");
function councilDiag(msg) {
  try {
    fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
    fs.appendFileSync(LOG_FILE, `[${(/* @__PURE__ */ new Date()).toISOString()}] ${msg}
`);
  } catch {
  }
}
var MAX_DEBATE_TOKENS = 18e4;
function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}
function textOfContent(content) {
  if (typeof content === "string") return content;
  if (content !== null && typeof content === "object") {
    if ("message" in content && typeof content.message === "object") {
      const inner = content.message?.content;
      if (inner !== void 0) return textOfContent(inner);
    }
    if ("text" in content && typeof content.text === "string") {
      return content.text;
    }
  }
  if (Array.isArray(content)) {
    return content.map((part) => {
      if (typeof part === "string") return part;
      if (part !== null && typeof part === "object") {
        if ("text" in part && typeof part.text === "string") {
          return part.text;
        }
      }
      return "";
    }).filter((t) => t.length > 0).join(" ");
  }
  return "";
}
var COUNCIL_DENIED_TOOLS = [
  "oracle_review",
  "dispatch_task",
  "subagent",
  "subagent_fork",
  "subagent_codex",
  "subagent_claude_code",
  "bash",
  "edit",
  "write",
  "str_replace_editor",
  "todo_write",
  "plan_mode",
  "goal",
  "roundtable",
  "chorus",
  "memory_save",
  "memory_search",
  "memory_rescind",
  "memory_confirm"
];
function resolvePersonaModel(ctx, persona) {
  try {
    const settings = ctx.get("settings");
    const doc = settings?.get?.("enpoi-orchestration");
    const key = persona.toLowerCase().replace(/^the\s+/, "").trim();
    const entry = doc?.personas?.[key];
    if (entry && entry.provider && entry.model) {
      return {
        provider: entry.provider,
        model: entry.model,
        ...entry.reasoningEffort ? { reasoningEffort: entry.reasoningEffort } : {}
      };
    }
  } catch (err) {
    councilDiag(`resolvePersonaModel error for ${persona}: ${String(err)}`);
  }
  return void 0;
}
function applyPersonaModel(ctx, childId, persona) {
  try {
    const entry = resolvePersonaModel(ctx, persona);
    if (entry && entry.provider && entry.model) {
      const sessions = ctx.get("sessions");
      const childSession = sessions?.get?.(childId);
      if (childSession && typeof childSession.append === "function") {
        childSession.append("request/header", {
          header: {
            config: {
              provider: entry.provider,
              model: entry.model,
              ...entry.reasoningEffort ? { reasoningEffort: entry.reasoningEffort } : {}
            }
          },
          reason: "custom"
        });
        councilDiag(`Applied persona model header for ${persona}: ${entry.provider}/${entry.model}`);
      }
    } else {
      councilDiag(`Persona ${persona} has no override \u2014 inheriting parent model`);
    }
  } catch (err) {
    councilDiag(`applyPersonaModel warning for ${persona}: ${String(err)}`);
  }
}
async function startDebaterFiber(ctx, parent, persona, systemPrompt, initialPromptText, signal) {
  const denied = COUNCIL_DENIED_TOOLS.filter((name2) => ctx.tools.get(name2) !== void 0);
  const personaModel = resolvePersonaModel(ctx, persona);
  councilDiag(`Spawning debater ${persona} with model: ${personaModel ? `${personaModel.provider}/${personaModel.model}` : `inherited from parent (${parent.options.provider}/${parent.options.model})`}`);
  const started = await ctx.subagents.startContinuable({
    provider: "spawn",
    label: `council debater: ${persona}`,
    quiet: true,
    request: {
      prompt: [{ type: "text", text: initialPromptText }],
      parent,
      persona: systemPrompt,
      toolFilter: denied.length > 0 ? { deny: denied } : void 0,
      ...personaModel !== void 0 ? {
        agentOptions: {
          provider: personaModel.provider,
          model: personaModel.model
        }
      } : {}
    },
    signal
  });
  if (!started.childId || started.childId === "null" || !started.childId.includes("-")) {
    throw new Error(`council debater spawn returned an invalid child id for ${persona}: ${String(started.childId)}`);
  }
  applyPersonaModel(ctx, started.childId, persona);
  return {
    persona,
    childId: started.childId,
    isOffline: false,
    lastTurnSeq: 0,
    totalTokens: 0
  };
}
async function followupDebaterFiber(ctx, parent, fiber, promptText, signal) {
  await ctx.subagents.followup(
    parent,
    fiber.childId,
    [{ type: "text", text: promptText }],
    {
      source: { kind: "user" },
      signal
    }
  );
}
async function waitForFiberTurn(ctx, childId, signal, timeoutMs = 9e4) {
  const started = Date.now();
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal.addEventListener("abort", onAbort, { once: true });
  try {
    for (; ; ) {
      if (signal.aborted) throw new Error("council deliberation aborted");
      if (Date.now() - started > timeoutMs) throw new Error(`council debater timed out after ${timeoutMs}ms`);
      if (ctx.agents.get(childId) === void 0) {
        const persistence = ctx.get("sessionPersistence");
        if (persistence !== void 0) {
          const loaded = await persistence.load(childId);
          const events = loaded.events;
          const lastUser = [...events].reverse().find((e) => e.type === "user/message");
          const since = lastUser === void 0 ? 0 : lastUser.seq;
          const messages = events.filter((e) => e.type === "assistant/message" && e.seq > since);
          if (messages.length > 0) {
            const extracted = messages.map((m) => {
              const data = m.data;
              return textOfContent(data.message?.content ?? data.content);
            }).filter((t) => t.length > 0).join("\n").trim();
            if (extracted.length > 0) {
              return extracted;
            }
          }
          const turnEnd = events.find((e) => e.type === "turn/end" && e.seq > since);
          if (turnEnd !== void 0) {
            const reason = turnEnd.data?.reason;
            if (reason?.kind === "error") {
              const errMsg = reason.error?.message ?? reason.failure?.message ?? "Model execution failed";
              throw new Error(`Turn failed: ${errMsg}`);
            }
            if (reason?.kind === "aborted") {
              const abortCause = reason.reason?.kind ?? "cancelled";
              throw new Error(`Turn was aborted (${abortCause})`);
            }
            if (reason?.kind === "completed" && messages.length === 0) {
              return "[NO_OUTPUT: debater returned empty content]";
            }
          }
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}
async function executeParallelRound(ctx, parent, fibers, promptBuilder, isRound1, systemPromptMap, signal) {
  const activeFibers = fibers.filter((f) => !f.isOffline);
  const tasks = activeFibers.map(async (fiber) => {
    const prompt = promptBuilder(fiber);
    let attempt = 0;
    let lastError = null;
    while (attempt < 2) {
      attempt++;
      try {
        if (isRound1) {
          councilDiag(`[round 1] starting fiber for ${fiber.persona}`);
          const sysPrompt = systemPromptMap[fiber.persona] ?? "";
          const newFiber = await startDebaterFiber(ctx, parent, fiber.persona, sysPrompt, prompt, signal);
          fiber.childId = newFiber.childId;
          councilDiag(`[round 1] started fiber for ${fiber.persona} -> childId=${fiber.childId}`);
        } else {
          councilDiag(`[round >1] follow-up for ${fiber.persona} -> childId=${fiber.childId}`);
          await followupDebaterFiber(ctx, parent, fiber, prompt, signal);
        }
        councilDiag(`waiting for turn on ${fiber.persona} (${fiber.childId})...`);
        const text = await waitForFiberTurn(ctx, fiber.childId, signal);
        councilDiag(`turn complete on ${fiber.persona} (${fiber.childId}) -> text len ${text.length}`);
        const tokens = estimateTokens(text);
        fiber.totalTokens += tokens;
        const isConcur = /^\s*CONCUR\s*$/i.test(text) || text.trim() === "CONCUR";
        return {
          persona: fiber.persona,
          childId: fiber.childId,
          text,
          tokens,
          isConcur
        };
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        councilDiag(`ERROR on ${fiber.persona} attempt ${attempt}: ${lastError.stack || lastError.message}`);
        if (signal.aborted) throw lastError;
        if (attempt >= 2) break;
        await new Promise((r) => setTimeout(r, 500));
      }
    }
    fiber.isOffline = true;
    return {
      persona: fiber.persona,
      childId: fiber.childId,
      text: `[DEBATER ERROR: ${fiber.persona} failed: ${lastError?.message ?? "deliberation failed"}]`,
      tokens: 0,
      isConcur: false,
      error: lastError?.message ?? "deliberation failed"
    };
  });
  const results = await Promise.allSettled(tasks);
  const responses = [];
  let onlineCount = 0;
  for (const r of results) {
    if (r.status === "fulfilled") {
      responses.push(r.value);
      if (!r.value.error) onlineCount++;
    } else {
      responses.push({
        persona: "Unknown",
        childId: "",
        text: `[DEBATER ERROR: unhandled promise rejection: ${String(r.reason)}]`,
        tokens: 0,
        isConcur: false,
        error: String(r.reason)
      });
    }
  }
  if (onlineCount < 2 && fibers.length >= 3) {
    const errorDetails = responses.filter((r) => r.error).map((r) => `${r.persona}: ${r.error}`).join("; ");
    throw new Error(`Council failed 2/3 quorum: only ${onlineCount}/${fibers.length} debaters responded online. Errors: ${errorDetails}`);
  }
  return responses;
}
async function disposeCouncilFibers(ctx, fibers) {
  for (const fiber of fibers) {
    if (fiber.childId) {
      try {
        const sessionStore = ctx.get("sessions");
        if (sessionStore !== void 0) {
          await sessionStore.delete(fiber.childId);
        }
      } catch {
      }
    }
  }
}

// packages/enpoi-council/src/stopping.ts
var STOP_WORDS = /* @__PURE__ */ new Set([
  "the",
  "is",
  "at",
  "which",
  "on",
  "a",
  "an",
  "and",
  "or",
  "in",
  "to",
  "for",
  "with",
  "that",
  "this",
  "it",
  "from",
  "be",
  "are",
  "was",
  "were",
  "as",
  "by",
  "of",
  "we",
  "i",
  "you",
  "they",
  "he",
  "she",
  "it",
  "our",
  "my",
  "your",
  "their",
  "should",
  "would",
  "could",
  "can",
  "will",
  "not",
  "no",
  "but",
  "if",
  "then",
  "so",
  "there",
  "what",
  "when",
  "where",
  "how",
  "all",
  "any",
  "both",
  "each",
  "few",
  "more",
  "most",
  "some"
]);
function extractClaimTokens(text) {
  const words = text.toLowerCase().split(/[^\p{L}\p{N}_-]+/u).map((w) => w.trim()).filter((w) => w.length >= 2 && !STOP_WORDS.has(w));
  const tokens = /* @__PURE__ */ new Set();
  for (let i = 0; i < words.length; i++) {
    tokens.add(words[i]);
    if (i < words.length - 1) {
      tokens.add(`${words[i]}_${words[i + 1]}`);
    }
  }
  return tokens;
}
function calculateJaccardSimilarity(setA, setB) {
  if (setA.size === 0 && setB.size === 0) return 1;
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 1 : intersection / union;
}
function evaluateStopping(state, criticOutput, currentClaims) {
  const round = state.round;
  if (state.cumulativeTokens >= state.maxTokens) {
    return {
      shouldStop: true,
      reason: `Emergency token ceiling reached (${state.cumulativeTokens} tokens >= ${state.maxTokens} limit).`,
      stopCode: "TOKEN_CEILING",
      heuristicFallback: false,
      consensusRatio: criticOutput?.consensusScore ?? 0.5,
      delta: 0
    };
  }
  if (round >= state.maxRounds) {
    return {
      shouldStop: true,
      reason: `Maximum rounds limit (${state.maxRounds}) reached.`,
      stopCode: "MAX_ROUNDS",
      heuristicFallback: false,
      consensusRatio: criticOutput?.consensusScore ?? 0.5,
      delta: 0
    };
  }
  const prevEntry = state.history.at(-1);
  const prevClaims = prevEntry?.claims ?? /* @__PURE__ */ new Set();
  const jaccardSim = calculateJaccardSimilarity(prevClaims, currentClaims);
  const delta = 1 - jaccardSim;
  let consensusRatio = 0;
  let heuristicFallback = false;
  if (criticOutput !== null && typeof criticOutput.consensusScore === "number" && !isNaN(criticOutput.consensusScore)) {
    consensusRatio = Math.max(0, Math.min(1, criticOutput.consensusScore));
  } else {
    heuristicFallback = true;
    consensusRatio = jaccardSim;
  }
  if (consensusRatio >= 0.8 && round >= 2) {
    return {
      shouldStop: true,
      reason: `Consensus reached (consensus ratio: ${consensusRatio.toFixed(2)} >= 0.80).`,
      stopCode: "CONSENSUS_REACHED",
      heuristicFallback,
      consensusRatio,
      delta
    };
  }
  if (round >= 3 && delta < 0.05) {
    const prevDelta = state.history.length >= 2 ? 1 - calculateJaccardSimilarity(state.history[state.history.length - 2].claims, prevClaims) : 1;
    if (prevDelta < 0.25 || delta < 0.02) {
      return {
        shouldStop: true,
        reason: `Idea generation and debate arguments have plateaued (delta: ${delta.toFixed(3)} < 0.05).`,
        stopCode: "PLATEAU_DETECTED",
        heuristicFallback,
        consensusRatio,
        delta
      };
    }
  }
  return {
    shouldStop: false,
    reason: `Continuing deliberation (round ${round}, consensus: ${consensusRatio.toFixed(2)}, delta: ${delta.toFixed(3)}).`,
    stopCode: "CONTINUE",
    heuristicFallback,
    consensusRatio,
    delta
  };
}

// packages/enpoi-council/src/roundtable.ts
var DEBATER_SYSTEMS = {
  Skeptic: SKEPTIC_SYSTEM,
  Architect: ARCHITECT_SYSTEM,
  Pragmatist: PRAGMATIST_SYSTEM
};
function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = arr[i];
    arr[i] = arr[j];
    arr[j] = temp;
  }
  return arr;
}
function parseCriticScore(text) {
  try {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    if (typeof parsed === "object" && parsed !== null) {
      return {
        consensusScore: Number(parsed.consensusScore ?? 0.5),
        qualityScore: Number(parsed.qualityScore ?? 0.5),
        continueDecision: parsed.continueDecision === "STOP" ? "STOP" : "CONTINUE",
        reasonIfStop: typeof parsed.reasonIfStop === "string" ? parsed.reasonIfStop : null,
        runningBrief: typeof parsed.runningBrief === "string" ? parsed.runningBrief : ""
      };
    }
  } catch {
  }
  return null;
}
function getLivingBriefContext(ctx, parent) {
  try {
    const projections = ctx.get("sessionProjections");
    if (projections !== void 0) {
      const snap = projections.snapshot(parent.session);
      const lb = snap?.values?.livingBrief;
      if (lb) {
        const goal = lb.goal ? `Goal: ${lb.goal}` : "";
        const prose = lb.prose?.text ?? "";
        const decisions = lb.decisions && lb.decisions.length > 0 ? `Decisions:
${lb.decisions.map((d) => `\u2022 ${d.text}`).join("\n")}` : "";
        return {
          text: [goal, prose, decisions].filter(Boolean).join("\n\n"),
          goalSeq: lb.goalSeq ?? 0
        };
      }
    }
  } catch {
  }
  return { text: "", goalSeq: 0 };
}
async function runRoundtable(ctx, parent, args, signal) {
  const startedAt = Date.now();
  const maxRounds = args.maxRounds ?? 5;
  const hideLimit = args.hideLimit ?? true;
  const modelsUsed = {
    Skeptic: "flagship",
    Architect: "flagship",
    Pragmatist: "flash",
    Critic: "flagship"
  };
  try {
    await getBriefService()?.ensureFreshBrief(parent.session, signal);
  } catch {
    if (signal.aborted) throw signal.reason ?? new Error("aborted");
  }
  const { text: briefText, goalSeq: initialGoalSeq } = getLivingBriefContext(ctx, parent);
  const debaterFibers = [
    { persona: "Skeptic", childId: "", isOffline: false, lastTurnSeq: 0, totalTokens: 0 },
    { persona: "Architect", childId: "", isOffline: false, lastTurnSeq: 0, totalTokens: 0 },
    { persona: "Pragmatist", childId: "", isOffline: false, lastTurnSeq: 0, totalTokens: 0 }
  ];
  let criticFiber = null;
  const stoppingState = {
    round: 1,
    maxRounds,
    hideLimit,
    cumulativeTokens: 0,
    maxTokens: MAX_DEBATE_TOKENS,
    history: []
  };
  const roundsTranscript = [];
  let lastCriticBrief = "";
  let finalSynthesis = "";
  let lastStopDecision = { shouldStop: false, reason: "", consensusRatio: 0 };
  try {
    for (let round = 1; round <= maxRounds; round++) {
      if (signal.aborted) throw new Error("roundtable debate cancelled by user");
      stoppingState.round = round;
      const isRound1 = round === 1;
      const responses = await executeParallelRound(
        ctx,
        parent,
        debaterFibers,
        (fiber) => {
          if (isRound1) {
            return buildRoundtableRound1Prompt(args.query, briefText);
          } else {
            const prevRound = roundsTranscript[round - 2];
            const opponents = (prevRound?.responses ?? []).filter((r) => r.persona !== fiber.persona && !r.error && !r.isConcur).map((r) => ({ persona: r.persona, text: r.text }));
            return buildRoundtableRound2PlusPrompt(args.query, shuffle(opponents), lastCriticBrief, round);
          }
        },
        isRound1,
        DEBATER_SYSTEMS,
        signal
      );
      if (signal.aborted) throw new Error("roundtable debate cancelled by user");
      for (const r of responses) {
        stoppingState.cumulativeTokens += r.tokens;
      }
      const roundClaimsText = responses.map((r) => r.text).join(" ");
      const currentClaims = extractClaimTokens(roundClaimsText);
      const roundTranscriptText = responses.map((r) => `### ${r.persona}:
${r.text}`).join("\n\n");
      const consensusHistory = stoppingState.history.map((h) => h.consensusRatio);
      const criticPrompt = buildCriticScoringPrompt(args.query, round, roundTranscriptText, consensusHistory);
      let criticScore = null;
      if (criticFiber === null) {
        criticFiber = await startDebaterFiber(ctx, parent, "Critic", CRITIC_SYSTEM, criticPrompt, signal);
      } else {
        await ctx.subagents.followup(parent, criticFiber.childId, [{ type: "text", text: criticPrompt }], {
          source: { kind: "user" },
          signal
        });
      }
      const criticText = await waitForFiberTurn(ctx, criticFiber.childId, signal);
      stoppingState.cumulativeTokens += estimateTokens(criticText);
      criticScore = parseCriticScore(criticText);
      if (criticScore?.runningBrief) {
        lastCriticBrief = criticScore.runningBrief;
      }
      roundsTranscript.push({
        round,
        responses,
        critic: criticScore
      });
      const decision = evaluateStopping(stoppingState, criticScore, currentClaims);
      stoppingState.history.push({
        round,
        claims: currentClaims,
        consensusRatio: decision.consensusRatio
      });
      lastStopDecision = decision;
      if (decision.shouldStop) {
        break;
      }
    }
    if (signal.aborted) throw new Error("roundtable debate cancelled by user");
    const { goalSeq: finalGoalSeq } = getLivingBriefContext(ctx, parent);
    const driftWarning = finalGoalSeq > initialGoalSeq ? `[DRIFT WARNING: The session goal changed during deliberation (seq ${initialGoalSeq} -> ${finalGoalSeq})]` : null;
    const allRoundsText = roundsTranscript.map((r) => `## Round ${r.round}
` + r.responses.map((d) => `### ${d.persona}:
${d.text}`).join("\n\n")).join("\n\n---\n\n");
    const synthPrompt = buildCriticSynthesisPrompt(args.query, allRoundsText, driftWarning);
    if (criticFiber !== null) {
      await ctx.subagents.followup(parent, criticFiber.childId, [{ type: "text", text: synthPrompt }], {
        source: { kind: "user" },
        signal
      });
      finalSynthesis = await waitForFiberTurn(ctx, criticFiber.childId, signal);
      stoppingState.cumulativeTokens += estimateTokens(finalSynthesis);
    } else {
      finalSynthesis = `## Council Decision

Debate completed after ${stoppingState.round} rounds.

${allRoundsText}`;
    }
    const dissents = [];
    const dissentMatches = finalSynthesis.matchAll(/\[DISSENT:([^\]]+)\]\s*\*\*([^*]+)\*\*:\s*"([^"]+)"/g);
    for (const m of dissentMatches) {
      dissents.push(`[${m[2]}]: ${m[3]}`);
    }
    const elapsedSec = ((Date.now() - startedAt) / 1e3).toFixed(1);
    const consensusSparkline = stoppingState.history.map((h) => h.consensusRatio.toFixed(2)).join(" \u2500\u2500\u25BA ");
    const footer = [
      `

---`,
      `*High Council Debate completed in ${stoppingState.round} round(s) (${elapsedSec}s) | Consensus Trajectory: ${consensusSparkline} | Why stopped: ${lastStopDecision.reason}*`
    ].join("\n");
    return {
      synthesis: finalSynthesis + footer,
      roundsRun: stoppingState.round,
      consensusRatio: lastStopDecision.consensusRatio,
      stopReason: lastStopDecision.reason,
      totalTokens: stoppingState.cumulativeTokens,
      modelsUsed,
      dissents
    };
  } finally {
    const allFibers = [...debaterFibers];
    if (criticFiber !== null) allFibers.push(criticFiber);
    await disposeCouncilFibers(ctx, allFibers);
  }
}

// packages/enpoi-council/src/chorus.ts
import { getBriefService as getBriefService2 } from "dsh-enpoi-context-keeper";
var CHORUS_SYSTEMS = {
  Visionary: VISIONARY_SYSTEM,
  Experiencer: EXPERIENCER_SYSTEM,
  Integrator: INTEGRATOR_SYSTEM
};
function getLivingBriefText(ctx, parent) {
  try {
    const projections = ctx.get("sessionProjections");
    if (projections !== void 0) {
      const snap = projections.snapshot(parent.session);
      const lb = snap?.values?.livingBrief;
      if (lb) {
        return [lb.goal ? `Goal: ${lb.goal}` : "", lb.prose?.text ?? ""].filter(Boolean).join("\n\n");
      }
    }
  } catch {
  }
  return "";
}
async function runChorus(ctx, parent, args, signal) {
  const startedAt = Date.now();
  const maxRounds = args.maxRounds ?? 4;
  const hideLimit = args.hideLimit ?? true;
  const modelsUsed = {
    Visionary: "flagship",
    Experiencer: "flagship",
    Integrator: "flash",
    Curator: "flagship"
  };
  try {
    await getBriefService2()?.ensureFreshBrief(parent.session, signal);
  } catch {
    if (signal.aborted) throw signal.reason ?? new Error("aborted");
  }
  const briefText = getLivingBriefText(ctx, parent);
  const lensFibers = [
    { persona: "Visionary", childId: "", isOffline: false, lastTurnSeq: 0, totalTokens: 0 },
    { persona: "Experiencer", childId: "", isOffline: false, lastTurnSeq: 0, totalTokens: 0 },
    { persona: "Integrator", childId: "", isOffline: false, lastTurnSeq: 0, totalTokens: 0 }
  ];
  let curatorFiber = null;
  const stoppingState = {
    round: 1,
    maxRounds,
    hideLimit,
    cumulativeTokens: 0,
    maxTokens: MAX_DEBATE_TOKENS,
    history: []
  };
  const roundsTranscript = [];
  let lastCuratorBrief = "";
  let lastGems = [];
  let finalHarvest = "";
  let lastStopReason = "completed";
  try {
    for (let round = 1; round <= maxRounds; round++) {
      if (signal.aborted) throw new Error("chorus brainstorm cancelled by user");
      stoppingState.round = round;
      const isRound1 = round === 1;
      const responses = await executeParallelRound(
        ctx,
        parent,
        lensFibers,
        (_fiber) => {
          if (isRound1) {
            return buildChorusRound1Prompt(args.query, briefText);
          } else {
            return buildChorusRound2PlusPrompt(args.query, lastCuratorBrief, lastGems, round);
          }
        },
        isRound1,
        CHORUS_SYSTEMS,
        signal
      );
      if (signal.aborted) throw new Error("chorus brainstorm cancelled by user");
      for (const r of responses) {
        stoppingState.cumulativeTokens += r.tokens;
      }
      const roundIdeasText = responses.map((r) => r.text).join(" ");
      const currentIdeaTokens = extractClaimTokens(roundIdeasText);
      const roundTranscriptText = responses.map((r) => `### ${r.persona}:
${r.text}`).join("\n\n");
      const curatorPrompt = `=== CURATOR REVIEW \u2014 ROUND ${round} ===
Brainstorm Topic: "${args.query}"

--- Round ${round} Proposals ---
${roundTranscriptText}

Provide:
1. Short 2-3 sentence brief summarizing the newest themes.
2. 1-2 Spotlight Gems from this round (lines starting with "\u2022 GEM:").`;
      if (curatorFiber === null) {
        curatorFiber = await startDebaterFiber(ctx, parent, "Curator", CURATOR_SYSTEM, curatorPrompt, signal);
      } else {
        await ctx.subagents.followup(parent, curatorFiber.childId, [{ type: "text", text: curatorPrompt }], {
          source: { kind: "user" },
          signal
        });
      }
      const curatorText = await waitForFiberTurn(ctx, curatorFiber.childId, signal);
      stoppingState.cumulativeTokens += estimateTokens(curatorText);
      lastCuratorBrief = curatorText;
      const gemMatches = curatorText.matchAll(/•\s*GEM:\s*([^\n]+)/gi);
      lastGems = [];
      for (const gm of gemMatches) {
        lastGems.push(gm[1].trim());
      }
      roundsTranscript.push({
        round,
        responses,
        curatorBrief: curatorText
      });
      const decision = evaluateStopping(stoppingState, null, currentIdeaTokens);
      stoppingState.history.push({
        round,
        claims: currentIdeaTokens,
        consensusRatio: 0.5
      });
      lastStopReason = decision.reason;
      if (decision.shouldStop) {
        break;
      }
    }
    if (signal.aborted) throw new Error("chorus brainstorm cancelled by user");
    const allRoundsText = roundsTranscript.map((r) => `## Round ${r.round}
` + r.responses.map((d) => `### ${d.persona}:
${d.text}`).join("\n\n")).join("\n\n---\n\n");
    const harvestPrompt = buildCuratorHarvestPrompt(args.query, allRoundsText);
    if (curatorFiber !== null) {
      await ctx.subagents.followup(parent, curatorFiber.childId, [{ type: "text", text: harvestPrompt }], {
        source: { kind: "user" },
        signal
      });
      finalHarvest = await waitForFiberTurn(ctx, curatorFiber.childId, signal);
      stoppingState.cumulativeTokens += estimateTokens(finalHarvest);
    } else {
      finalHarvest = `## Chorus Harvest

Brainstorm completed after ${stoppingState.round} rounds.

${allRoundsText}`;
    }
    const elapsedSec = ((Date.now() - startedAt) / 1e3).toFixed(1);
    const footer = [
      `

---`,
      `*Chorus Brainstorm completed in ${stoppingState.round} round(s) (${elapsedSec}s) | Why stopped: ${lastStopReason}*`
    ].join("\n");
    return {
      harvest: finalHarvest + footer,
      roundsRun: stoppingState.round,
      gems: lastGems,
      stopReason: lastStopReason,
      totalTokens: stoppingState.cumulativeTokens,
      modelsUsed
    };
  } finally {
    const allFibers = [...lensFibers];
    if (curatorFiber !== null) allFibers.push(curatorFiber);
    await disposeCouncilFibers(ctx, allFibers);
  }
}

// packages/enpoi-council/src/tools.ts
function registerCouncilTools(ctx, root) {
  ctx = root;
  const busyCouncils = /* @__PURE__ */ new Set();
  ctx.tools.register({
    name: "roundtable",
    description: [
      "Run a multi-agent dialectic debate (Skeptic, Architect, Pragmatist, Critic) to resolve architectural trade-offs,",
      "stress-test assumptions, and reach battle-tested technical consensus.",
      "Colosseum protocol: Targeted premise interrogation, defend/concede/reframe state machine, and zero-token dynamic silence (CONCUR).",
      "Hardcoded blocking \u2014 returns the complete synthesized Council Decision report with consensus trajectory and persistent dissents."
    ].join(" "),
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The specific architectural dilemma, design choice, or technical decision to debate."
        },
        maxRounds: {
          type: "number",
          description: "Safety round cap (default 5, configurable to 8+ for complex multi-system tasks)."
        },
        hideLimit: {
          type: "boolean",
          description: "Hide the round ceiling from debaters to eliminate deadline-pacing bias (default true)."
        }
      },
      required: ["query"]
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          synthesis: { type: "string" },
          roundsRun: { type: "number" },
          consensusRatio: { type: "number" },
          stopReason: { type: "string" },
          dissents: { type: "array", items: { type: "string" } }
        },
        required: ["synthesis", "roundsRun", "consensusRatio", "stopReason", "dissents"]
      },
      render: (_args, value) => [{
        type: "text",
        text: value.synthesis
      }]
    },
    async execute(args, exec) {
      const parent = exec.agent;
      if (parent === void 0) throw new Error("roundtable requires a calling agent");
      const key = parent.session.id;
      if (busyCouncils.has(key)) {
        return {
          synthesis: "## Council Decision\n\nDebate rejected by single-flight mutex (I7): another Council deliberation is already running.",
          roundsRun: 0,
          consensusRatio: 0,
          stopReason: "CONCURRENT_CALL_REJECTED",
          dissents: []
        };
      }
      busyCouncils.add(key);
      try {
        const result = await runRoundtable(ctx, parent, args, exec.signal);
        return {
          synthesis: result.synthesis,
          roundsRun: result.roundsRun,
          consensusRatio: result.consensusRatio,
          stopReason: result.stopReason,
          dissents: result.dissents
        };
      } finally {
        busyCouncils.delete(key);
      }
    }
  });
  ctx.tools.register({
    name: "chorus",
    description: [
      "Run a multi-agent constructive brainstorm (Visionary, Experiencer, Integrator, Curator) to expand vague ideas",
      "into concrete feature options, user moments, and buildable-now roadmaps.",
      "Polyphonic ideation: Ideas build on ideas with effort tags (now/soon/later) and gem spotlighting.",
      "Hardcoded blocking \u2014 returns the complete Idea Harvest report with themes, gems, and buildable roadmaps."
    ].join(" "),
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The vision, feature concept, or seed idea to brainstorm."
        },
        maxRounds: {
          type: "number",
          description: "Safety round cap (default 4)."
        },
        hideLimit: {
          type: "boolean",
          description: "Hide the round ceiling from models (default true)."
        }
      },
      required: ["query"]
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          harvest: { type: "string" },
          roundsRun: { type: "number" },
          gems: { type: "array", items: { type: "string" } },
          stopReason: { type: "string" }
        },
        required: ["harvest", "roundsRun", "gems", "stopReason"]
      },
      render: (_args, value) => [{
        type: "text",
        text: value.harvest
      }]
    },
    async execute(args, exec) {
      const parent = exec.agent;
      if (parent === void 0) throw new Error("chorus requires a calling agent");
      const key = parent.session.id;
      if (busyCouncils.has(key)) {
        return {
          harvest: "## Chorus Harvest\n\nBrainstorm rejected by single-flight mutex (I7): another Council deliberation is already running.",
          roundsRun: 0,
          gems: [],
          stopReason: "CONCURRENT_CALL_REJECTED"
        };
      }
      busyCouncils.add(key);
      try {
        const result = await runChorus(ctx, parent, args, exec.signal);
        return {
          harvest: result.harvest,
          roundsRun: result.roundsRun,
          gems: result.gems,
          stopReason: result.stopReason
        };
      } finally {
        busyCouncils.delete(key);
      }
    }
  });
}

// packages/enpoi-council/src/index.ts
var name = "enpoi-council";
var inject = ["tools", "subagents", "sessionPersistence", "sessions", "agents"];
var ORCH_NS = settingsNamespace("enpoi-orchestration");
var PersonaModelSchema = import_schemastery.default.object({
  provider: import_schemastery.default.string(),
  model: import_schemastery.default.string(),
  reasoningEffort: import_schemastery.default.string()
});
var OrchestrationSettingsSchema = import_schemastery.default.object({
  personas: import_schemastery.default.dict(PersonaModelSchema).default({}),
  uiPreferences: import_schemastery.default.object({
    hiddenModels: import_schemastery.default.any(),
    favorites: import_schemastery.default.any(),
    providerOrder: import_schemastery.default.any(),
    defaultModel: import_schemastery.default.any()
  }).default({})
});
function apply(ctx) {
  ctx.inject(["settings"], (scope) => {
    const settings = scope.get("settings");
    try {
      settings?.register?.(ORCH_NS, OrchestrationSettingsSchema);
    } catch {
    }
  });
  ctx.inject(["tools", "subagents", "sessionPersistence", "sessions", "agents"], (injected) => {
    registerCouncilTools(injected, ctx);
  });
}
export {
  apply,
  inject,
  name
};
