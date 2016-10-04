"use strict";
var HarmonyHubDiscover = require("harmonyhubjs-discover");
var harmony = require("harmonyhubjs-client");

var self = module.exports = {
    connecting: false,

    init: function() {
        console.log("Initializing Harmony Hub app...");
        //self.monitorCurrentHubActivity();
        self.listenForTriggers();
        console.log("Initializing Harmony Hub app completed.");
    },

    /**
     * Starts monitors for changes in the current activity on all hub(s) found.
     *
     * @returns {}
     */
    monitorCurrentHubActivity: function() {
        function getHubs(callback) {
            var discover = new HarmonyHubDiscover(61991);
            discover.on("update", function (hubs) {
                // Combines the online & update events by returning an array with all known hubs for ease of use.
                discover.stop();

                var hubIps = hubs.reduce(function (prev, hub) {
                    return prev + (prev.length > 0 ? ", " : "") + hub.ip;
                }, "");
                console.log("found hubs: " + hubIps);

                callback(hubs);
            });

            discover.start();
        }

        function getActivityName(harmonyClient, activityId, callback) {
            harmonyClient.getActivities()
                .then(function(activities) {
                    activities.forEach(function(activity) {
                        if (activity.id === activityId) {
                            if (callback) callback(activity.label);
                        }
                    });
                }, function(error) {
                    console.log("Get activities failed: ");
                    console.log(JSON.stringify(error));
                    callback(error, null);
                });
        }

        getHubs(function (hubs) {

            function getCurrentActivity(hub, callback) {
                console.log("- Connecting to " + hub.ip + "...");
                harmony(hub.ip)
                    .then(function(harmonyClient) {
                        console.log("- Client connected.");
                        harmonyClient.isOff()
                            .then(function(off) {
                                if (off) {
                                    harmonyClient.end();
                                    console.log("- Hub status: off");
                                    if (callback) callback(null);
                                } else {
                                    console.log("- Hub status: on");
                                    harmonyClient.getCurrentActivity()
                                        .then(function(currentActivityId) {
                                            if (currentActivityId !== null) {
                                                getActivityName(harmonyClient, currentActivityId, function(activityName) {
                                                    harmonyClient.end();
                                                    if (callback) callback({ id: currentActivityId, name: activityName });
                                                });
                                            } else {
                                                harmonyClient.end();
                                                if (callback) callback(null);
                                            }
                                        }, function(error) {
                                            console.log("Get current activity activity failed: ");
                                            console.log(JSON.stringify(error));
                                            callback(error, null);
                                        });
                                }
                            }, function(error) {
                                console.log("Getting device state failed: ");
                                console.log(JSON.stringify(error));
                                callback(error, null);
                            });
                    }, function(error) {
                        console.log("Connecting to hub failed: ");
                        console.log(JSON.stringify(error));
                        callback(error, null);
                    });
            }

            hubs.forEach(function (hub) {
                hub.currentActivity = null;
                setInterval(function() {
                    getCurrentActivity(hub, function (activity) {
                        if (activity !== null) {
                            if (hub.currentActivity !== null && hub.currentActivity.id !== activity.id) {
                                Homey.manager("flow").trigger("activity_changed", { activity: activity.name });
                                console.log("Activity changed: " + activity.name);
                            }

                            hub.currentActivity = activity;
                        }
                    });
                }, 5000);
            });
        });
    },

    /**
     * Starts listening for specific triggers and sends them to the requested Harmony Hub.
     *
     * @returns {}
     */
    listenForTriggers: function() {

        /**
         * Starts the specified activity through the given harmony client.
         *
         * @param {} harmonyClient
         * @param {} activityName
         * @returns {} true/false
         */
        function startActivity(callback, harmonyClient, activityId) {
            harmonyClient.getActivities()
                .then(function(activities) {
                    var started = activities.some(function(activity) {
                        if (activity.id === activityId) {
                            // Found the activity we want.
                            console.log("Activity '" + activity.label + "' found. Starting...");
                            harmonyClient.startActivity(activity.id);
                            harmonyClient.end();
                            console.log("Activity '" + activity.label + "' started.");
                            return true;
                        } else {
                            return false;
                        }
                    });

                    callback(null, started);
                }, function(error) {
                    console.log("Get activities failed: ");
                    console.log(JSON.stringify(error));
                    callback(error, null);
                });
        }

        /**
         * Turns off all devices through the given harmony client.
         *
         * @param {} harmonyClient
         * @returns {} true/false
         */
        function turnOff(harmonyClient) {
            harmonyClient.turnOff();
            harmonyClient.end();
            console.log("All devices turned off.");
            return true;
        }

        /**
         * Gets a list of devices, returned through the specified callback method.
         *
         * @param {} harmonyClient
         * @param {} callback
         * @returns {}
         */
        function getDevices(harmonyClient, callback) {
            harmonyClient.getAvailableCommands()
                .then(function(commands) {
                    var devices = [];
                    commands.device.forEach(function(device) {
                        console.log("Found device " + device.id + ": " + device.label);
                        //device.icon = "";
                        device.name = device.label;
                        device.description = device.model;
                        devices.push(device);
                    });
                    harmonyClient.end();
                    if (callback) callback(devices);
                }, function(error) {
                    console.log("Get devices failed: ");
                    console.log(JSON.stringify(error));
                    callback(error, null);
                });
        }

        /**
         * Sends the specified command through the given harmony client.
         *
         * @param {} harmonyClient
         * @param {} action
         * @returns {} true/false
         */
        function sendAction(harmonyClient, action) {
            var encodedAction = action.replace(/\:/g, "::");
            harmonyClient.send("holdAction", "action=" + encodedAction + ":status=press");
            harmonyClient.end();
            console.log("Action sent.");
            return true;
        }

        Array.prototype.sortBy = function(p) {
            return this.slice(0).sort(function(a, b) {
                return (a[p] > b[p]) ? 1 : (a[p] < b[p]) ? -1 : 0;
            });
        }

        Homey.manager("flow").on("action.start_activity.activity.autocomplete", function(callback, args) {
            console.log("Finding activity '" + args.query + "' on " + args.args.hub.ipaddress + "...");
            harmony(args.args.hub.ipaddress)
                .then(function(harmonyClient) {
                    console.log("- Client connected.");
                    harmonyClient.getActivities()
                        .then(function(activities) {
                            //console.log(activities);
                            harmonyClient.end();
                            var listOfActivities = [];
                            activities.forEach(function(activity) {
                                if (activity.isAVActivity && (args.query.length === 0 || activity.label.toUpperCase().indexOf(args.query.toUpperCase()) !== -1)) {
                                    activity.name = activity.label;
                                    activity.icon = activity.baseImageUri + activity.imageKey;
                                    listOfActivities.push(activity);
                                }
                            });
                            callback(null, listOfActivities.sortBy("activityOrder"));
                        }, function(error) {
                            console.log("Get activities failed: ");
                            console.log(JSON.stringify(error));
                            callback(error, null);
                        });
                }, function(error) {
                    console.log("Get activities failed: ");
                    console.log(JSON.stringify(error));
                    callback(error, null);
                });
        });

        Homey.manager("flow").on("action.send_command_to_device.device.autocomplete", function(callback, args) {
            if (self.connecting) {
                callback("Connecting. Please wait...", null);
                return;
            }
            self.connecting = true;
            console.log("Finding device '" + args.query + "' on " + args.args.hub.ipaddress + "...");
            harmony(args.args.hub.ipaddress)
                .then(function(harmonyClient) {
                    getDevices(harmonyClient, function(devices) {
                        callback(null, devices.sortBy("name"));
                    });
                }, function(error) {
                    console.log("Connecting to hub failed: ");
                    console.log(JSON.stringify(error));
                    callback(error, null);
                }).finally(function() {
                    self.connecting = false;
                });
        });

        Homey.manager("flow").on("action.send_command_to_device.controlGroup.autocomplete", function(callback, args) {
            if (args.args.device.length === 0) {
                callback(null, []);
                return;
            }

            callback(null, args.args.device.controlGroup.sortBy("name"));
        });

        Homey.manager("flow").on("action.send_command_to_device.action.autocomplete", function(callback, args) {
            if (args.args.device.length === 0 || args.args.controlGroup.length === 0) {
                callback(null, []);
                return;
            }

            var actions = [];
            args.args.controlGroup.function.forEach(function(action) {
                action.name = action.label;
                actions.push(action);
            });

            callback(null, actions.sortBy("name"));
        });

        Homey.manager("flow").on("action.start_activity", function(callback, args) {
            console.log("Starting activity '" + args.activity.name + "' on " + args.hub.ipaddress + "...");
            harmony(args.hub.ipaddress)
                .then(function(harmonyClient) {
                    console.log("- Client connected.");
                    harmonyClient.isOff()
                        .then(function(off) {
                            if (off) {
                                console.log("- Hub status: off");
                                console.log("Starting activity...");
                                startActivity(function(error, started) {
                                    if (error) {
                                        console.log("Starting activity failed: ");
                                        console.log(JSON.stringify(error));
                                        callback(error, null);
                                    } else {
                                        callback(null, started);
                                    }
                                }, harmonyClient, args.activity.id);
                            } else {
                                console.log("- Hub status: on");
                                harmonyClient.getCurrentActivity()
                                    .then(function(currentActivityId) {
                                        console.log("Current activity id: " + currentActivityId);
                                        console.log("Requested activity id: " + args.activity.id);
                                        if (currentActivityId !== args.activity.id) {
                                            console.log("Switching activity...");
                                            startActivity(function(error, started) {
                                                if (error) {
                                                    console.log("Switching activity failed: ");
                                                    console.log(JSON.stringify(error));
                                                    callback(error, null);
                                                } else {
                                                    callback(null, started);
                                                }
                                            }, harmonyClient, args.activity.id);
                                        } else {
                                            console.log("Requested activity already selected.");
                                            callback(null, true);
                                            harmonyClient.end();
                                        }
                                    }, function(error) {
                                        console.log("Get current activity failed: ");
                                        console.log(JSON.stringify(error));
                                        callback(error, null);
                                    });
                            }
                        }, function(error) {
                            console.log("Unable to determine client state: ");
                            console.log(JSON.stringify(error));
                            callback(error, null);
                        });
                }, function(error) {
                    console.log("Starting activity failed: ");
                    console.log(JSON.stringify(error));
                    callback(error, null);
                });
        });

        Homey.manager("flow").on("action.send_command_to_device", function (callback, args) {
            console.log("Sending command to " + args.hub.ipaddress + "...");
            harmony(args.hub.ipaddress)
                .then(function(harmonyClient) {
                    var actionSent = sendAction(harmonyClient, args.action.action);
                    callback(null, actionSent);
                }, function(error) {
                    console.log("Sending command failed: ");
                    console.log(JSON.stringify(error));
                    callback(error, null);
                });
        });

        Homey.manager("flow").on("action.all_off", function (callback, args) {
            console.log("Turning all devices off on " + args.hub.ipaddress + "...");
            harmony(args.hub.ipaddress)
                .then(function(harmonyClient) {
                    harmonyClient.isOff()
                        .then(function(off) {
                            if (!off) {
                                var turnedOff = turnOff(harmonyClient);
                                callback(null, turnedOff);
                            }
                        }, function(error) {
                            console.log("Unable to determine client state: ");
                            console.log(JSON.stringify(error));
                            callback(error, null);
                        }).finally(function() {
                            harmonyClient.end();
                        });
                }, function(error) {
                    console.log("Turning everything off failed: ");
                    console.log(JSON.stringify(error));
                    callback(error, null);
                });
        });

        console.log("Listening for triggers...");
    }
};
