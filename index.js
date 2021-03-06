var _ = require('lodash');

var mongodates = function(input) {
  if (!(this instanceof mongodates)) {
    return new mongodates(input);
  }

  this._schema = input;

};
var clone = function(obj) {
  return JSON.parse(JSON.stringify(obj));
};


mongodates.prototype.getDateProperties = function(prefix, schema) {
  var paths = this.getDatePaths();
  var properties = [];
  paths.datetimes.forEach(function(path) {
    properties.push(path[2]);
  });
  paths.dates.forEach(function(path) {
    properties.push(path[2]);
  });

  return properties;
}

mongodates.prototype.getDatePaths = function(prefix, schema) {
  if (!prefix) {
    prefix = [];
  }
  if (!schema) {
    schema = this._schema;
  }
  var that = this;
  switch (schema.type) {

    case 'object':
      var pathsDate = [];
      var pathsDateTime = [];

      var subpaths;
      _.each(schema.properties, function(v, k) {
        switch (v.type) {
          case 'object':
            subpaths = that.getDatePaths(_.flatten([prefix, k]), v);
            pathsDate = pathsDate.concat(subpaths);
            pathsDateTime = pathsDateTime.concat(subpaths);
            break;
          case 'array':
            if (v.items) {
              subpaths = that.getDatePaths(_.flatten([prefix, k, '*']), v.items);
              if (subpaths) {
                pathsDate = pathsDate.concat(subpaths.dates);
                pathsDateTime = pathsDateTime.concat(subpaths.datetimes);
              }
            }
            break;
          case 'date':
            pathsDate.push(_.flatten([prefix, k]));
            break;
          case 'string':
            if (v.format && v.format == "date")
              pathsDate.push(_.flatten([prefix, k]));
            if (v.format && v.format == "date-time")
              pathsDateTime.push(_.flatten([prefix, k]));
            break;
        }
      });
      return {
        "dates": pathsDate,
        "datetimes": pathsDateTime
      };

    case 'date':
      // there's only one path here, so return it as an array
      return ([_.flatten(prefix)]);
    case 'string':
      if (schema.format && schema.ormat == "date")
        return ({
          "dates": [_.flatten(prefix)],
          "datetimes": []
        });
      if (schema.format && schema.format == "date-time")
        return ({
          "dates": [],
          "datetimes": [_.flatten(prefix)]
        });
      break;

    case 'array':
      // we're not done here, so mark it as an array and recurse
      prefix.push('*');
      return that.getDatePaths(prefix, schema.items);

    default:
      // there are no paths to return.
      return {
        "dates": [],
        "datetimes": []
      };

  }
};

mongodates.prototype.getDateFromDateTime = function(strDateTime) {
  var date = new Date(strDateTime);
  var year = date.getUTCFullYear();
  var month = date.getUTCMonth() + 1;
  var dt = date.getUTCDate();

  if (dt < 10) {
    dt = '0' + dt;
  }
  if (month < 10) {
    month = '0' + month;
  }
  return year + '-' + month + '-' + dt;
};

mongodates.prototype.datesToStrings = function(obj) {
  var paths = this.getDatePaths();
  var that = this;
  var errs = [];
  paths.datetimes.forEach(function(path) {
    if (path)
      obj = that.pathApply(obj, path, function(item) {
        if(!item.$date && (new Date(item)).toString() != "Invalid Date")
            return item;
        if ((new Date(item.$date)).toString() === "Invalid Date") {
          var message = "Incorrect date format - got " + item.toString();
          errs.push(new Error(message));
        }
        
        return (new Date(item.$date)).toISOString();
      });
  });

  paths.dates.forEach(function(path) {
    if (path)
      obj = that.pathApply(obj, path, function(item) {
        if(!item.$date && (new Date(item)).toString() != "Invalid Date")
            return item;
        if ((new Date(item.$date)).toString() === "Invalid Date") {
          var message = "Incorrect date format - got " + item.toString();
          errs.push(new Error(message));
        }
        
        return that.getDateFromDateTime((new Date(item.$date)).toISOString());
      });
  });
  if (errs.length) {
    var err = new Error("Date validation error.  Check this.errors for path. In schema " + (this.name || ""));
    err.errors = errs;
    err.name = "DateValidationError";
    throw err;
  }
  return obj;
};

mongodates.prototype.stringsToDates = function(obj) {
  var paths = this.getDatePaths();
  var that = this;
  var errs = [];
  paths.datetimes.forEach(function(path) {
    if (path)
      obj = that.pathApply(obj, path, function(item) {
        if ((new Date(item)).toString() === "Invalid Date") {
          var message = "Incorrect date format - got " + item.toString();
          errs.push(new Error(message));
        }
        return {
          "$date": (new Date(item)).valueOf()
        };
      });
  });

  paths.dates.forEach(function(path) {
    if (path)
      obj = that.pathApply(obj, path, function(item) {
        if ((new Date(item)).toString() === "Invalid Date") {
          var message = "Incorrect date format - got " + item.toString();
          errs.push(new Error(message));
        }

        return {
          "$date": (new Date(item)).valueOf()
        };
      });
  });
  if (errs.length) {
    var err = new Error("Date validation error.  Check this.errors for path. In schema " + (this.name || ""));
    err.errors = errs;
    err.name = "DateValidationError";
    throw err;
  }
  return obj;
};

var isSet = function(obj) {
  return ((obj !== null) && (obj !== undefined));
};

mongodates.prototype.pathApply = function(obj, path, fn) {
  var that = this;
  if (!isSet(obj)) {
    return obj;
  }
  if (!_.isArray(path)) {
    throw new Error("argument error: in schema " + (this.name || "") + " path was not an array: " + path);
  }
  if (path.length === 0) {
    return fn(obj);
  }
  var prop = path.shift();
  if (prop === '*') {
    // it's an array!
    if (_.isArray(obj)) {
      obj = obj.map(function(item) {
        // deep copy the path.
        var newPath = clone(path);
        return that.pathApply(item, newPath, fn);
      });
    }
  }
  else {
    var newObj = obj[prop];
    if (newObj) {
      obj[prop] = this.pathApply(newObj, path, fn);
    }
  }
  return obj;
};

module.exports = mongodates;
