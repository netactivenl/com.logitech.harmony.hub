"use strict";

var harmony = require("harmonyhubjs-client");

var self = module.exports = {
    init: function() {
        console.log("Initializing Harmony Hub app...");
        self.listenForTriggers();
        console.log("Initializing Harmony Hub app completed.");
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
            console.log("Turning all devices off...");
            harmonyClient.turnOff();
            harmonyClient.end();
            console.log("All devices turned off.");
            return true;
        }

        Homey.manager('flow').on('action.start_activity.activity.autocomplete', function (callback, args) {
            // TODO: For debugging purposes and to validate issue #234 (https://github.com/athombv/homey/issues/234) was fixed.
            console.log(args.query);
            console.log(args.hub);

            //var ipaddress = args.hub.ipaddress;
            var ipaddress = "192.168.2.20";

            console.log("Finding activity '" + args.query + "' on " + ipaddress + "...");
            harmony(ipaddress)
                .then(function(harmonyClient) {
                    console.log("- Client connected.");
                    harmonyClient.getActivities()
                        .then(function(activities) {
                            console.log(activities);
                            harmonyClient.end();
                            var listOfActivities = [];
                            activities.forEach(function(activity) {
                                if (activity.isAVActivity && (args.query.length === 0 || activity.name.toUpperCase().indexOf(args.query.toUpperCase()) !== -1)) {
                                    activity.name = activity.label;
                                    activity.icon = activity.baseImageUri + activity.imageKey;
                                    listOfActivities.push(activity);
                                }
                            });
                            callback(null, listOfActivities);
                        });
                });
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
                                var started = startActivity(harmonyClient, args.activity.id);
                                callback(null, started);
                            } else {
                                console.log("- Hub status: on");
                                harmonyClient.getCurrentActivity()
                                    .then(function(currentActivityId) {
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

        Homey.manager("flow").on("action.all_off", function(callback, args) {
            harmony(args.hub.ipaddress)
                .then(function(harmonyClient) {
                    harmonyClient.isOff()
                        .then(function(off) {
                            if (!off) {
                                var turnedOff = turnOff(harmonyClient);
                                callback(null, turnedOff);
                            }
                        }).finally(function() {
                            harmonyClient.end();
                        });
                });
        });

        console.log("Listening for triggers...");
    }
};