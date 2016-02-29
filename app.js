"use strict";
var HarmonyHubDiscover = require("harmonyhubjs-discover");
var harmony = require("harmonyhubjs-client");

var self = module.exports = {
    init: function() {
        console.log("Initializing Harmony Hub app...");
        self.monitorCurrentHubActivity();
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
                .then(function (activities) {
                    activities.forEach(function(activity) {
                        if (activity.id === activityId) {
                            if (callback) callback(activity.label);
                        }
                    });
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
                                        });
                                }
                            });
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
        function startActivity(harmonyClient, activityId) {
            harmonyClient.getActivities()
                .then(function(activities) {
                    activities.some(function(activity) {
                        if (activity.id === activityId) {
                            // Found the activity we want.
                            console.log("Activity '" + activity.name + "' found. Starting...");
                            harmonyClient.startActivity(activity.id);
                            harmonyClient.end();
                            console.log("Activity '" + activity.name + "' started.");
                            return true;
                        }

                        // This activity is not the one we want.
                        return false;
                    });
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
            // TODO: For debugging purposes and to validate issue #234 (https://github.com/athombv/homey/issues/234) was fixed.
            console.log(args);
            //var ipaddress = args.hub.ipaddress;
            var ipaddress = "192.168.2.20";

            console.log("Finding activity '" + args.query + "' on " + ipaddress + "...");
            harmony(ipaddress)
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
                        });
                });
        });
        
        Homey.manager("flow").on("action.send_command_to_device.device.autocomplete", function (callback, args) {
            // TODO: For debugging purposes and to validate issue #234 (https://github.com/athombv/homey/issues/234) was fixed.
            //var ipaddress = args.hub.ipaddress;
            var ipaddress = "192.168.2.20";

            harmony(ipaddress)
                .then(function(harmonyClient) {
                    getDevices(harmonyClient, function(devices) {
                        callback(null, devices.sortBy("name"));
                    });
                });
        });

        Homey.manager("flow").on("action.send_command_to_device.controlGroup.autocomplete", function(callback, args) {
            if (args.device.length === 0) {
                callback(null, []);
                return;
            }

            callback(null, args.device.controlGroup.sortBy("name"));
        });

        Homey.manager("flow").on("action.send_command_to_device.action.autocomplete", function(callback, args) {
            if (args.device.length === 0 || args.controlGroup.length === 0) {
                callback(null, []);
                return;
            }

            var actions = [];
            args.controlGroup.function.forEach(function(action) {
                action.name = action.label;
                actions.push(action);
            });

            callback(null, actions.sortBy("name"));
        });
        
        Homey.manager("flow").on("action.start_activity", function (callback, args) {
            console.log("Starting activity '" + args.activity.name + "' on " + args.hub.ipaddress + "...");
            harmony(args.hub.ipaddress)
                .then(function (harmonyClient) {
                console.log("- Client connected.");
                harmonyClient.isOff()
                        .then(function (off) {
                    if (off) {
                        console.log("- Hub status: off");
                        var started = startActivity(harmonyClient, args.activity.id);
                        callback(null, started);
                    } else {
                        console.log("- Hub status: on");
                        harmonyClient.getCurrentActivity()
                                    .then(function (currentActivityId) {
                            console.log("Current activity: " + currentActivityId);
                            var switched;
                            if (currentActivityId !== args.activity.id) {
                                console.log("Switching activity...");
                                switched = startActivity(harmonyClient, args.activity.id);
                            } else {
                                console.log("Requested activity already selected.");
                                switched = true;
                                harmonyClient.end();
                            }
                            callback(null, switched);
                        });
                    }
                });
            });
            
            callback(null, true);
        });
        
        Homey.manager("flow").on("action.send_command_to_device", function (callback, args) {
            console.log("Sending command to " + args.hub.ipaddress + "...");
            harmony(args.hub.ipaddress)
                .then(function (harmonyClient) {
                var actionSent = sendAction(harmonyClient, args.action.action);
                callback(null, actionSent);
            }).catch(function (e) {
                console.log(e);
                callback(null, false);
            });
        });
        
        Homey.manager("flow").on("action.all_off", function (callback, args) {
            console.log("Turning all devices off on " + args.hub.ipaddress + "...");
            harmony(args.hub.ipaddress)
                .then(function (harmonyClient) {
                harmonyClient.isOff()
                        .then(function (off) {
                    if (!off) {
                        var turnedOff = turnOff(harmonyClient);
                        callback(null, turnedOff);
                    }
                }).finally(function () {
                    harmonyClient.end();
                });
            });
        });

        console.log("Listening for triggers...");
    }
};