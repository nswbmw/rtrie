'use strict';

var iconv = require('iconv');

/**
 * @class Rtrie
 *
 * @param {Object} options
 * @param {String} options.trieKey the key prefixes for indexes
 * @param {String} options.metadataKey the key prefixes for metadata
 * @param {String} options.client redis client
 * @param {String} options.host redis host(only `client` not exist)
 * @param {String} options.port redis port(only `client` not exist)
 * @param {String} options.password redis password(only `client` not exist)
 */
function Rtrie(options) {
  options = options || {};
  this.trieKey = options.trieKey || 'trie:index:';
  this.metadataKey = options.metadataKey || 'trie:metadata';
  this.redis = options.client || new require('ioredis')(options);
}

/**
 * add the `key` with a given `value` and `id` and `priority`.
 *
 * @param {String} key key for index
 * @param {Object} value data you may want to store directly on the index.
 * @param {String} id id for metadata
 * @param {Number} priority the relevance of this item in comprassion of others.
 * @return {Promise} Promise
 * @api public
 */
Rtrie.prototype.add = function(key, value, id, priority) {
  if (arguments.length < 3) {
    return Promise.reject(new Error('`key` and `value` and `id` must be given!'));
  }
  priority = priority || 0;

  var redis = this.redis;
  var trieKey = this.trieKey;
  var metadataKey = this.metadataKey;

  var parts = prefixes(transliterate(key).toLowerCase());
  var multi = redis.multi();

  parts.forEach(function (part) {
    multi.zadd(trieKey + part, priority, id);
  });

  multi.hset(metadataKey, id, JSON.stringify(value));
  return multi.exec();
};

/**
 * del the `key`.
 *
 * @param {String} key key for index
 * @param {String} id id for metadata
 * @return {Promise} Promise
 * @api public
 */
Rtrie.prototype.del = function(key, id) {
  if (!key || !id) {
    return Promise.reject(new Error('`key` and `id` must be given!'));
  }

  var redis = this.redis;
  var trieKey = this.trieKey;
  var metadataKey = this.metadataKey;

  var parts = prefixes(transliterate(key).toLowerCase());
  var multi = redis.multi();

  parts.forEach(function (part) {
    multi.zrem(trieKey + part, id);
  });
  
  multi.hdel(metadataKey, id);
  return multi.exec();
};

/**
 * Searches for a key.
 * 
 * @param {String} key the search key
 * @param {Number} limit the maximum number of results
 * @return {Promise} Promise
 * @api public
 */
Rtrie.prototype.search = function(key, limit) {
  if (!key) {
    return Promise.reject(new Error('`key` must be given!'));
  }
  limit = limit || 20;

  var indexKey = this.trieKey + transliterate(key).trim().toLowerCase();
  var redis = this.redis;
  var metadataKey = this.metadataKey;

  return redis.zrevrange(indexKey, 0, limit - 1)
    .then(function (ids) {
      if (!ids.length) {
        return [];
      }
      return redis.hmget(metadataKey, ids);
    })
    .then(function (results) {
      return results.map(JSON.parse);
    });
};

/**
 * Return all the `term` prefixes.
 *
 * @param {String} term
 * @return {Array} prefixes of the term
 * @api private
 */
function prefixes(term) {
  return term
    .split(' ')
    .map(function (word) {
      word = word.trim();
      var prefixes = [];
      for (var i = 0; i < word.length; i++) {
        prefixes.push(word.slice(0, i + 1));
      }
      return prefixes;
    })
    .reduce(function (words, prefixes) {
      return words.concat(prefixes);
    });
}

/**
 * Transliterate a given `term`.
 *
 * @param {String} term
 * @return {String} the converted ascii version of the string
 * @api private
 */
var converter = new iconv.Iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE');
function transliterate(term) {
  return converter.convert(term).toString();
}

module.exports = Rtrie;
