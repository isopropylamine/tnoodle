/*** STUPID IE ***/
if(!Array.prototype.map) {
    Array.prototype.map = function(func) {
        var new_arr = [];
        for(var i = 0; i < this.length; i++) {
            new_arr[i] = func(this[i]);
        }
        return new_arr;
    };
}
function xAddListener(obj, event, func, useCapture) {
    if(obj.addEventListener) {
        obj.addEventListener(event, func, useCapture);
    } else {
        obj.attachEvent('on'+event, function(e) { func.call(obj, e); });
    }
}

var $chk = function(obj){
    return !!(obj || obj === 0);
};

/*** END STUPID IE ***/
var tnoodle = tnoodle || {};

tnoodle.aveDescription = "Michael Gottlieb and I have agreed to extend the definition of a trimmed average from 5 and 12 solves to an arbitrary number of solves. The objective is to throw out ~10% of the solves, the best 5% and the worst 5%. Michael's clever idea to get this to coincide with the current definitions of RA 5 (see WCA) and RA 12 (by overwhelming convention) is to define the number of trimmed solves as:\n trimmed(n) = 2*ceil[ (n/10)/2 ] = (n/10) rounded up to the nearest even integer\n It should be easy to check that trimmed(5) = 2 and trimmed(12) = 2, as desired.";
tnoodle.TRIMMED = function(n) {
    return 2*Math.ceil( (n/10)/2 );
};

tnoodle.server = function() {
    /**** Time server stuff ***/
    function Configuration() {
        //TODO GAH! localStorage doesn't work offline in ff! wtf?
        //https://bugzilla.mozilla.org/show_bug.cgi?id=507361
        var localFile = document.location.href.match(/^file:\/\/.*$/) && navigator.userAgent.match(/firefox/i);
        var cookies = null;
        if(!localStorage || localFile) {
            var Cookies = function() {
                function setCookie(c_name,value,expiredays) {
                    var exdate=new Date();
                    exdate.setDate(exdate.getDate()+expiredays);
                    document.cookie=c_name+ "=" +escape(value)+
                        ((!expiredays) ? "" : ";expires="+exdate.toUTCString());
                }

                var data = {};

                var cookies = document.cookie.split(';');
                this.length = cookies.length;
                var keys = [];
                for(var i = 0; i < this.length; i++) {
                    var key_val = cookies[i].split('=');
                    var key = key_val[0].trim();
                    var val = unescape(key_val[1]);
                    data[key] = val;
                    keys.push(key);
                }
                this.key = function(i) {
                    return keys[i];
                };
                this.getItem = function(key) {
                    return data[key];
                };
                this.setItem = function(key, val) {
                    data[key] = val;
                    setCookie(key, val.replace(/;/g, '\\u003b').replace(/\=/g, '\\u003d'), 100);
                };
            };
            cookies = new Cookies();
        } else {
            cookies = localStorage;
        }
        var data = {};
        for(var i = 0; i < cookies.length; i++) {
            var key = cookies.key(i);
            try {
                //NOTE: JSON.encode is hacked to deal with Infinity
                data[key] = JSON.decode(cookies.getItem(key));
            } catch(error) {
                //oh well
            }
        }

        this.set = function(property, value) {
            if(value === null || value === undefined) {
                delete data[property];
                delete cookies[property];
            } else {
                data[property] = value;
//                  cookies.setItem(property, JSON.stringify(value));
                //it seems that mootools is breaking stringify with arrays?

                //NOTE: JSON.encode is hacked to deal with Infinity
                cookies.setItem(property, JSON.encode(value));
            }
        };
        this.get = function(property, def) {
            if(!(property in data)) {
                this.set(property, def); // This is pretty silly
                return def;
            }
            return data[property];
        };
    }
    this.configuration = new Configuration();

    var server = this;
    this.formatTime = function(millis, decimalPlaces) {
        if(millis === null) {
            return "";
        }
        millis = Math.round(millis);
        if(decimalPlaces !== 0) {
            decimalPlaces = decimalPlaces || server.configuration.get('timer.statsDecimalPlaces');
        }

        if(millis == Infinity) {
            return "DNF";
        } else if(server.configuration.get('clockFormat', true)) {
            return server.clockFormat(millis, decimalPlaces);
        } else {
            return (millis/1000.0).toFixed(decimalPlaces);
        }
    };
    this.clockFormat = function(timeMillis, decimalPlaces) {
        timeMillis = Math.round(timeMillis);
        if(decimalPlaces !== 0) {
            decimalPlaces = decimalPlaces || server.configuration.get('timer.statsDecimalPlaces');
        }

        // Javascript behaves *retardedly* with small numbers (< 1e-6)
        // > parseInt(1/(1000*60*60)+"")
        //   2
        // The guys at mootools opted not to change this behavior.
        //  http://mootools.lighthouseapp.com/projects/2706/tickets/936
        // Se we're very careful to use Math.floor instead of parseInt
        // or mootool's .toInt().
        var hours = Math.floor(timeMillis / (1000*60*60));
        timeMillis = timeMillis % (1000*60*60);
        var minutes = Math.floor(timeMillis / (1000*60));
        timeMillis = timeMillis % (1000*60);
        var seconds = Math.floor(timeMillis / 1000);
        var millis = timeMillis % 1000;

        var clocked = "";
        if(hours > 0) {
            clocked += hours + ":";
            if(minutes === 0) {
                clocked += "00:";
            } else if(minutes < 10) {
                clocked += "0";
            }
        }
        if(minutes > 0) {
            clocked += minutes + ":";
            if(seconds < 10) {
                clocked += "0";
            }
        }
        clocked += seconds;
        if(decimalPlaces > 0) {
            var decimals = "";
            if(millis < 100) {
                decimals += "0";
                if(millis < 10) {
                    decimals += "0";
                }
            }
            decimals += millis;
            if(decimalPlaces <= 3) {
                decimals = decimals.substring(0, decimalPlaces);
            } else {
                //just for completeness
                for(var i = 3; i < decimalPlaces; i++) {
                    decimals += "0";
                }
            }

            clocked += "." + decimals;
        }

        return clocked;
    };


    this.createSession = function(puzzle, event) {
        //id is the number of seconds since the epoch encoded in base 36 for readability
        var id = Math.round(new Date().getTime()/1000).toString(36);
        if(id in sessions) {
            //we don't want duplicate session ids
            return null;
        }
        var sesh = new tnoodle.Session(this, id, puzzle, event);
        sessions.push(sesh);
        this.saveSessions();
        return sesh;
    };
    this.disposeSession = function(session) {
        var i = sessions.indexOf(session);
        if(i < 0) {
            //couldn't find the session
            return false;
        }
        sessions.splice(i, 1);
        this.saveSessions();
        return true;
    };
    this.getSessions = function(puzzle, event) {
        var sessions = this.sessions.slice();
        if(puzzle !== undefined) {
            sessions = sessions.filter(function(session) { return session.getPuzzle() == puzzle; });
        }
        if(event !== undefined) {
            sessions = sessions.filter(function(session) { return session.getEvent() == event; });
        }
        sessions.sort(function(a, b) {
            return b.getDate().diff(a.getDate());
        });
        return sessions;
    };

    var events = {};
    this.getEvents = function(new_puzzle) {
        //initializing the available events
        for(var i = 0; i < sessions.length; i++) {
            var puzzle = sessions[i].getPuzzle();
            var event = sessions[i].getEvent();
            if(!(puzzle in events)) {
                events[puzzle] = [ '' ];
            }
            if(!events[puzzle].contains(event)) {
                events[puzzle].push(event);
            }
        }
        if(!(new_puzzle in events)) {
            events[new_puzzle] = [ '' ];
        }
        events[new_puzzle].sort();
        return events[new_puzzle];
    };
    this.createEvent = function(puzzle, event) {
        var events = this.getEvents(puzzle);
        if(!events.contains(event)) {
            events.push(event);
        }
        return true;
    };
    this.renameEvent = function(puzzle, oldevent, newevent) {
        //TODO - urgh... editing too?
    };
    this.removeEvent = function(puzzle, event) {
        //TODO - urgh... editing too?
    };
    this.getTags = function() {
        //TODO - optimize the hell out of this!
        var availableTags = {};
        var tags;
        for(var i = 0; i < sessions.length; i++) {
            var times = sessions[i].times;
            for(var j = 0; j < times.length; j++) {
                tags = times[j].tags;
                for(var k = 0; k < tags.length; k++) {
                    availableTags[tags[k]] = true;
                }
            }
        }
        tags = [];
        for(var tag in availableTags) {
            if(availableTags.hasOwnProperty(tag)) {
                tags.push(tag);
            }
        }
        tags.sort();
        return tags;
    };

    // Utility function to copy all the properties from oldObj into newObj
    function copyTo(oldObj, newObj) {
        for(var key in oldObj) {
            if(oldObj.hasOwnProperty(key)) {
                newObj[key] = oldObj[key];
            }
        }
    }
    var sessions = this.configuration.get('sessions', []);
    //transforming sessions (a JSON object) into an array of Sessions of Times
    try {
        var newSessions = [];
        for(var i = 0; i < sessions.length; i++) {
            var sesh = new tnoodle.Session(this);
            copyTo(sessions[i], sesh);
            for(var j = 0; j < sesh.times.length; j++) {
                var newTime = new tnoodle.Time(0);
                copyTo(sesh.times[j], newTime);
                // JSON doesn't treat Infinity like a number, so we
                // have to cons it up ourselves.
                if(newTime.millis === null && newTime.penalty == "DNF") {
                    newTime.millis = Infinity;
                }
                sesh.times[j] = newTime;
                newTime.setSession(sesh);
            }
            if(sesh.times.length > 0) {
                newSessions.push(sesh);
            }
        }
        sessions = newSessions;
    } catch(error) {
        alertException(error);
        //bummer
        sessions = [];
    }

    this.sessions = sessions;

    var config = this.configuration;
    var pendingSave = false;
    function bufferedSave() {
        pendingSave = false;
        config.set('sessions', sessions);
    }
    this.saveSessions = function() {
        if(pendingSave) {
            return;
        }
        pendingSave = true;
        setTimeout(bufferedSave, 500);
    };

    if(sessions.length === 0) {
        this.createSession("333", "");
    }
};

tnoodle.Time = function(time, scramble) {
    //this.session = null;
    var session = null;
    var server = null;
    this.setSession = function(sesh) {
        session = sesh;
        server = session === null ? null : session.getServer();
    };
    this.getSession = function() {
        return session;
    };
    this.decimalsAccurate = null;
    this.setDecimalsAccurate = function(newDecimalsAccurate) {
        this.decimalsAccurate = newDecimalsAccurate;
    };
    this.getDecimalsAccurate = function(newDecimalsAccurate) {
        if(this.decimalsAccurate !== null) {
            return this.decimalsAccurate;
        }
        return Infinity;
    };
    /* time can be either a number or a string */
    this.format = function(key) {
        key = key || 'millis';
        var type = tnoodle.Time.timeKeyTypeMap[key];
        if(type == tnoodle.Time) {
            var decimalPlaces = server.configuration.get('timer.statsDecimalPlaces');
            var decimalPlacesAccurate = this.getDecimalsAccurate();
            decimalPlaces = Math.min(decimalPlaces, decimalPlacesAccurate);
            // TODO - go through all calls to formatTime and consider making decimal
            // places a required argument?
            var time = server.formatTime(this[key], decimalPlaces);
            if(key == 'millis') {
                if(this.penalty == "+2") {
                    time += "+";
                }
            }
            return time;
        } else if(type == Date) {
            return this[key].toString();
        } else if(type == String) {
            return this[key].toString();
        } else if(type == Array) {
            return this[key].toString();
        } else if(type == Number) {
            return this[key].toString();
        } else {
            alert("Unrecognized type: " + type);
        }
    };
    this.parse = function(time) {
        if(time.length === 0) {
            throw "Must enter a time";
        }
        if(time.toUpperCase() == "DNF") {
            this.setPenalty("DNF");
            return;
        }
        //we wait until we've validated the time to set the penalty
        var penalty = null;
        if(time.match(/\+$/)) {
            penalty = "+2";
            time = time.substring(0, time.length-1);
        } else {
            penalty = null;
        }

        var hours = null, minutes = null, seconds = null;
        var coloned = time.split(':');
        var i = coloned.length;
        switch(i) {
        case 1:
            seconds = coloned[0];
            break;
        case 2:
            minutes = coloned[0];
            seconds = coloned[1];
            break;
        case 3:
            hours = coloned[0];
            minutes = coloned[1];
            seconds = coloned[2];
            break;
        default:
            throw "Too many colons";
        }

        function strictToInt(str) {
            if(!str.match(/^\d+$/)) {
                throw "Not an integer: " + str;
            }
            return str.toInt(10);
        }

        if(coloned[i-1] == ".") {
            throw "Invalid seconds value";
        }

        var valueMillis = 0;
        var seconds_millis = seconds.split('.');
        if(seconds_millis.length == 2 && seconds_millis[1].length > 0) {
            valueMillis += Math.round(1000*strictToInt(seconds_millis[1])*Math.pow(10, -seconds_millis[1].length));
        } else if(seconds_millis.length > 2) {
            throw "Too many decimal points";
        }
        if(seconds_millis[0].length > 0) {
            valueMillis += 1000*strictToInt(seconds_millis[0]);
        }
        if(minutes) {
            valueMillis += 60*1000*strictToInt(minutes);
        }
        if(hours) {
            valueMillis += 60*60*1000*strictToInt(hours);
        }

        this.millis = valueMillis;
        if(penalty == "+2") {
            valueMillis -= 2*1000;
        }
        if(valueMillis <= 0) {
            throw "Can't have times &leq; 0";
        }
        this.rawMillis = valueMillis;
        if(this.rawMillis > 10*365*24*60*1000) {
            throw "Can't have times > 10 years";
        }
        this.setPenalty(penalty);
    };
    //penalty can be "+2" or "DNF"
    //anything else is assumed to be no penalty
    this.setPenalty = function(penalty) {
        if(penalty != "+2" && penalty != "DNF") {
            penalty = null;
        }
        if(penalty == this.penalty) {
            return;
        }
        this.penalty = penalty;
        if(this.penalty == "+2") {
            this.millis = this.rawMillis + 2*1000;
        } else if(this.penalty == "DNF") {
            this.millis = Infinity;
            if(this.rawMillis === undefined) {
                this.rawMillis = Infinity;
            }
        } else {
            this.millis = this.rawMillis;
        }

        // Calling setComment updates this.tags
        this.setComment(this.comment);

        //TODO - server is null in the event that we're trying to add a new time
        if(server) {
            server.saveSessions();
        }
        //TODO - optimize
        //session.solvePenalized(this);
    };
    //always returns one of null, "+2", "DNF"
    this.getPenalty = function() {
        return this.penalty;
    };
    this.setComment = function(comment) {
        this.comment = (comment === null) ? "" : comment;
        this.tags = this.comment.match(/#\S+/g) || [];
        if(this.penalty) {
            this.tags.push(this.penalty);
        }

        //TODO - server is null in the event that we're trying to add a new time
        if(server) {
            server.saveSessions();
        }
        //TODO - optimize
        //session.solveCommented(this);
    };
    this.getComment = function() {
        return this.comment === null ? "" : this.comment;
    };

    this.ra5 = this.ra12 = this.ra100 = null;
    this.penalty = null;
    this.index = null;
    this.tags = [];
    this.date = new Date().getTime();
    this.scramble = scramble;
    this.comment = null;

    if(typeof(time) === "number") {
        this.millis = this.rawMillis = time;
    } else {
        this.parse(time.toString());
    }
};
(function() { //neat trick to avoid cloverring our namespace with the nthEl function
    function nthEl(n) {
        return function(a) {
            return a[n];
        };
    }
    var Time = tnoodle.Time;
    var keyInfo = [
        [ 'index', '', null, Number ],
        [ 'millis', 'Time', null, Time ],
        [ 'ra5', 'Ra 5', 'Trimmed average of 5', Time ],
        [ 'ra12', 'Ra 12', 'Trimmed average of 12', Time ],
        [ 'ra100', 'Ra 100', 'Trimmed average of 100', Time ],
        [ 'sessionAve', 'Ave', tnoodle.aveDescription, Time ]
        //The following columns seem silly
        //[ 'tags', 'Tags', null, Array ],
        //[ 'date', 'Date', 'Milliseconds since the epoch', Date ],
        //[ 'scramble', 'Scramble', null, String ]
    ];
    Time.KEY_INFO = keyInfo;
    Time.timeKeys = keyInfo.map(nthEl(0));
    Time.timeKeyNames = keyInfo.map(nthEl(1));
    Time.timeKeyDescriptions = keyInfo.map(nthEl(2));
    Time.timeKeyTypes = keyInfo.map(nthEl(3));
    Time.timeKeyTypeMap = {};
    for(var i = 0; i < keyInfo.length; i++) {
        Time.timeKeyTypeMap[keyInfo[i][0]] = keyInfo[i][3];
    }
})();

tnoodle.Session = function(server, id, puzzle, event) {
    this.getServer = function() {
        return server;
    };
    this.id = id;
    this.comment = null;
    this.getDate = function() {
        return new Date(1000*parseInt(this.id, 36));
    };
    this.puzzle = puzzle;
    this.event = event || '';
    //times is an array of Time's
    this.times = [];

    this.setPuzzle = function(newPuzzle) {
        this.puzzle = newPuzzle;
        server.saveSessions();
    };
    this.getPuzzle = function() {
        return this.puzzle;
    };
    this.setEvent = function(event) {
        this.event = event || '';
        server.saveSessions();
    };
    this.getEvent = function() {
        if(this.event === null) {
            return '';
        }
        return this.event;
    };
    this.setComment = function(comment) {
        this.comment = comment === '' ? null : comment;
        server.saveSessions();
    };
    this.getComment = function(comment) {
        return this.comment;
    };
    this.toString = function() {
        if(this.event.length === '') {
            return this.puzzle;
        } else {
            return this.puzzle + ":" + this.event;
        }
    };
    this.solveCount = function(lastTimeIndex, size) {
        if(!$chk(lastTimeIndex) || !$chk(size)) {
            lastTimeIndex = this.times.length-1;
            size = this.times.length;
        }
        var count = 0;
        for(var i = lastTimeIndex; i >= 0 && count < size; i--) {
            if(this.times[i].getPenalty() != "DNF") {
                count++;
            }
        }
        return count;
    };
    this.attemptCount = function() {
        return this.times.length;
    };
    this.reset = function() {
        var timesCopy = this.times.slice();
        var action = {
            undo: function() { this.times = timesCopy.slice(); }.bind(this),
            redo: function() { this.times.length = 0; }.bind(this)
        };
        this.pushHistory(action);
        action.redo();
        server.saveSessions();
    };
    //TODO - cache!
    this.bestWorst = function(key, lastTimeIndex, size) {
        if(!$chk(lastTimeIndex) || !$chk(size)) {
            lastTimeIndex = this.times.length-1;
            size = this.times.length;
        }
        if(key == 'sessionAve' || key == 'date' || key == 'tags') {
            // The concept of a best and worst really doesn't
            // exist or make sense for these keys.
            // We don't want to return a valid index,
            // else some cells will get marked as the "best" date, tags, etc.
            return {
                best: { millis: null, index: null },
                worst: { millis: null, index: null }
            };
        }
        var minKey = Infinity, maxKey = 0;
        var minIndex = null, maxIndex = null;
        for(var i = lastTimeIndex-size+1; i <= lastTimeIndex; i++) {
            var val = key ? this.times[i][key] : this.times[i].millis;
            if(val !== null) {
                //for min, we choose the *first* guy we can find
                if(val < minKey || (minIndex === null && val == minKey)) {
                    minKey = val;
                    minIndex = i;
                }
                //for max, we choose the *last* guy we can find
                if(val >= maxKey) {
                    maxKey = val;
                    maxIndex = i;
                }
            }
        }
        if(minIndex === null) {
            minKey = null;
        }
        if(maxIndex === null) {
            maxKey = null;
        }
        return {
            best: { millis: minKey, index: minIndex },
            worst: { millis: maxKey, index: maxIndex }
        };
    };
    this.stdDev = function(lastTimeIndex, count) {
        if(!lastTimeIndex) {
            lastTimeIndex = this.times.length-1;
            count = this.times.length;
        }
        var times = trimSolves(lastTimeIndex, count);
        if(times === null || times.length === 0) {
            return null;
        }
        times = times.map(function(a) { return a.millis; });
        var ave = times.average();
        if(ave === Infinity) {
            return ave;
        }

        var variance = 0;
        for(var i = 0; i < times.length; i++) {
            var val = times[i] - ave;
            variance += val*val;
        }
        variance /= times.length;
        return Math.sqrt(variance);
    };

    var THIS = this;

    function computeMedian(lastTimeIndex, size) {
        return computeRA(lastTimeIndex, size, 2*Math.floor((size-1)/2));
    }
    function computeRA(lastTimeIndex, size, trimmed) {
        var times = trimSolves(lastTimeIndex, size, trimmed);
        if(times === null) {
            return null;
        }
        return times.map(function(a) { return a.millis; }).average();
    }
    function trimSolves(lastTimeIndex, size, trimmed) {
        if(!$chk(trimmed)) {
            trimmed = tnoodle.TRIMMED(size);
        }
        if(trimmed % 2 !== 0 || trimmed >= size) {
            // trimmed must be even, and less than size
            return null;
        }

        var firstSolve = lastTimeIndex - size + 1;
        if(firstSolve < 0 || size === 0) {
            return null; //not enough solves
        }

        var times = THIS.times.slice(firstSolve, lastTimeIndex+1);
        times.sort(function(a, b) { return a.millis - b.millis; });
        times.splice(0, trimmed/2); //trim the best trimmed/2 solves
        times.splice(times.length - trimmed/2, times.length); //trim the worst trimmed/2 solves
        times.sort(function(a, b) { return a.index - b.index; });
        return times;
    }
    function privateAdd(time) {
        time.index = THIS.times.length;
        THIS.times.push(time);
        time.ra5 = computeRA(time.index, 5);
        time.ra12 = computeRA(time.index, 12);
        time.ra100 = computeRA(time.index, 100);
        time.sessionAve = computeRA(time.index, time.index+1);
    }

    this.addTime = function(time, scramble, unscramble) {
        var session = this;
        var action = {
            undo: function() {
                // Orphaned times have a null session
                time.setSession(null);
                this.disposeTime(time, true);
                unscramble(time);
            }.bind(this),
            redo: function(nothistory) {
                time.setSession(session);
                privateAdd(time);
                if(!nothistory) {
                    scramble();
                }
            }
        };
        this.pushHistory(action);
        action.redo(true);
        server.saveSessions();
    };
    this.reindex = function() {
        var oldTimes = this.times.slice();
        this.times.length = 0;
        for(var i = 0; i < oldTimes.length; i++) {
            privateAdd(oldTimes[i]);
        }
        server.saveSessions();
    };
    //returns the deleted time
    this.disposeTimeAt = function(index, nohistory) {
        var time = this.times[index];
        var action = {
            undo: function() {
                this.times.splice(index, 0, time);
                this.reindex();
            }.bind(this),
            redo: function() {
                this.times.splice(index, 1);
                this.reindex();
            }.bind(this)
        };
        if(!nohistory) {
            this.pushHistory(action);
        }
        action.redo();
        return time;
    };
    this.disposeTime = function(time, nohistory) {
        var index = this.times.indexOf(time);
        if(index >= 0) {
            this.disposeTimeAt(index, nohistory);
            return time;
        }
        return null;
    };
    this.disposeTimes = function(times) {
        var sanitizedTimes = [];
        for(var i = 0; i < times.length; i++) {
            var time = times[i];
            if(this.containsTime(time)) {
                sanitizedTimes.push(time);
            }
        }
        var action = {
            undo: function() {
                for(var i = 0; i < sanitizedTimes.length; i++) {
                    var time = sanitizedTimes[i];
                    this.times.splice(time.index, 0, time);
                }
                this.reindex();
            }.bind(this),
            redo: function() {
                for(var i = 0; i < sanitizedTimes.length; i++) {
                    this.disposeTime(sanitizedTimes[i], true);
                }
            }.bind(this)
        };
        this.pushHistory(action);
        action.redo();
    };
    this.containsTime = function(time) {
        return this.times.indexOf(time) >= 0;
    };

    var history = [];
    var histIndex = -1; //this points to the last action taken
    this.undo = function() {
        if(histIndex >= 0 && histIndex < history.length) {
            history[histIndex].undo();
            histIndex--;
        }
    };
    this.redo = function() {
        if(histIndex+1 >= 0 && histIndex+1 < history.length) {
            histIndex++;
            history[histIndex].redo();
        }
    };
    this.pushHistory = function(undo_redo_callback) {
        histIndex++;
        history[histIndex] = undo_redo_callback;
        // we remove everything after what we just added
        history.splice(histIndex+1, history.length-1);
    };
    this.formatTimes = function(lastTimeIndex, raSize, formatStr) {
        if(!$chk(lastTimeIndex) || !$chk(raSize)) {
            lastTimeIndex = this.times.length-1;
            raSize = this.times.length;
        }
        var f = server.formatTime;

        var date = this.getDate();
        var solves = this.solveCount(lastTimeIndex, raSize);
        var attempts = raSize;
        var average = f(computeRA(lastTimeIndex, raSize));
        var stdDev = f(this.stdDev(lastTimeIndex, raSize));

        var best_worst = this.bestWorst('millis', lastTimeIndex, raSize);
        var best = f(best_worst.best.millis);
        var worst = f(best_worst.worst.millis);

        var detailedTimes = '';
        var simpleTimes = '';
        // NOTE: countingTimes may be null if we try to trim too many solves
        var countingTimes = trimSolves(lastTimeIndex, raSize);
        var firstSolve = lastTimeIndex-raSize+1;
        var tagCounts = {};
        for(var offset = 0; offset < raSize; offset++) {
            var i = firstSolve+offset;
            var time = this.times[i];
            for(var j = 0; j < time.tags.length; j++) {
                var tag = time.tags[j].toLowerCase();
                tagCounts[tag] = (tagCounts[tag] || 0) + 1;
            }
            var timeStr = time.format();
            if(countingTimes && !countingTimes.contains(time)) {
                timeStr = "(" + timeStr + ")";
            }
            simpleTimes += (offset>0?', ':'') + timeStr;
            var scramble = (time.scramble || "").replace(/\n/g, ' ');
            detailedTimes += (offset+1) + ". " + timeStr + " " + scramble + "\n";
        }

        var stats = {
            'date': date,
            'attempts': attempts,
            'solves': solves,
            'stdDev': stdDev,
            'best': best,
            'worst': worst,
            'simpleTimes': simpleTimes,
            'detailedTimes': detailedTimes,
            'average': average
        };

        formatStr = formatStr.replace(/%#\S+/g, function(match) {
            return tagCounts[match.substring(2).toLowerCase()] || 0;
        });
        // TODO this doesn't work quite right... %%T
        for(var key in tnoodle.Session.formatLegend) {
            if(tnoodle.Session.formatLegend.hasOwnProperty(key)) {
                var statsKey = tnoodle.Session.formatLegend[key][1];
                formatStr = formatStr.replace(new RegExp(key, 'g'), stats[statsKey]);
            }
        }
        return formatStr;
    };
};

tnoodle.Session.defaultFormatStr = "";
tnoodle.Session.defaultFormatStr += 'Statistics for %d\n\n';
tnoodle.Session.defaultFormatStr += 'Average of %n/%N: %a\n';
tnoodle.Session.defaultFormatStr += 'Standard deviation: %s\n';
tnoodle.Session.defaultFormatStr += 'Number of DNFs: %#dnf\n';
tnoodle.Session.defaultFormatStr += 'Best time: %b\n';
tnoodle.Session.defaultFormatStr += 'Worst time: %w\n\n';
tnoodle.Session.defaultFormatStr += '%t = %a ave%N\n\n';
tnoodle.Session.defaultFormatStr += '%T';

tnoodle.Session.formatLegend = {
    '%d': [ 'Date', 'date' ],
    '%n': [ 'Solves', 'solves' ],
    '%N': [ 'Attempts', 'attempts' ],
    '%s': [ 'Stdev', 'stdDev' ],
    '%#TAG': [ '# of solves with #TAG (TAG is case-insensitve and can be +2/dnf)', null ],
    '%b': [ 'Best time', 'best' ],
    '%w': [ 'Worst time', 'worst' ],
    '%t': [ 'Times list', 'simpleTimes' ],
    '%T': [ 'Times+scrambles list', 'detailedTimes' ],
    '%a': [ 'Average', 'average' ],
    '%%': [ '%', '%']
};
