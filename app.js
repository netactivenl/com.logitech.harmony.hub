"use strict";
var harmony = require("harmonyhubjs-client");
var HarmonyHubDiscover = require("harmonyhubjs-discover");
var listOfHubs = [];
var discover;

var self = module.exports = {
    init: function() {
        console.log("Initializing Harmony Hub app...");

        var ipaddress = Homey.manager("settings").get("ipaddress");
        if (ipaddress) {
            // Listen for flow triggers.
            self.listenForTriggers(ipaddress);
        }

        self.discoverHubs();

        console.log("Initializing Harmony Hub app completed.");
    },

    /**
     * Starts listening for specific triggers and sends them to the Harmony Hub at the given IP address.
     * 
     * @param {} ipaddress 
     * @returns {} 
     */
    listenForTriggers: function (ipaddress, speechEnabled) {
        
        /**
         * Starts the specified activity through the given harmony client.
         * 
         * @param {} harmonyClient 
         * @param {} activityName 
         * @returns {} true/false
         */
        function startActivity(harmonyClient, activityName, speechEnabled) {
            console.log("Currently off. Starting activity '" + activityName + "'...");
            if (speechEnabled) {
                Homey.manager("speech-output").say(__("speech_starting_activity").replace("{0}", activityName));
            }
            harmonyClient.getActivities()
                .then(function(activities) {
                    activities.some(function(activity) {
                        if (activity.label === activityName) {
                            var id = activity.id;
                            harmonyClient.startActivity(id);
                            return true;
                        }
                        // We were not able to find an activity by the given name.
                        return false;
                    });
                }).finally(function() {
                    harmonyClient.end();
                });
        }

        /**
         * Turns off all devices through the given harmony client.
         * 
         * @param {} harmonyClient 
         * @returns {} true/false
         */
        function turnOff(harmonyClient, speechEnabled) {
            console.log("Currently on. Turning all devices off...");
            if (speechEnabled) {
                Homey.manager("speech-output").say(__("speech_turning_all_off"));
            }
            harmonyClient.turnOff();
            harmonyClient.end();
            return true;
        }

        // On triggered flow
        Homey.manager("flow").on("action.start_activity", function(callback, args) {
            harmony(ipaddress)
                .then(function(harmonyClient) {
                    harmonyClient.isOff()
                        .then(function(off) {
                            if (off) {
                                var result1 = self.startActivity(harmonyClient, args.activity);
                                harmonyClient.end();
                                callback(null, result1);
                            } else {
                                harmonyClient.getCurrentActivity()
                                    .then(function(currentActivity) {
                                        var result2;
                                        if (currentActivity !== args.activity) {
                                            result2 = startActivity(harmonyClient, args.activity, speechEnabled);
                                        } else {
                                            if (speechEnabled) {
                                                Homey.manager("speech-output").say(__("speech_activity_already_active"));
                                            }
                                            result2 = true;
                                        }
                                        callback(null, result2);
                                    }).finally(function() {
                                        harmonyClient.end();
                                    });
                            }
                        }).finally(function() {
                            harmonyClient.end();
                        });
                });
            callback(null, true); // we've fired successfully
        });

        Homey.manager("flow").on("action.all_off", function(callback, args) {
            harmony(ipaddress)
                .then(function(harmonyClient) {
                    harmonyClient.isOff()
                        .then(function(off) {
                            if (!off) {
                                var result = turnOff(harmonyClient, speechEnabled);
                                callback(null, result); // we've fired successfully
                            } else {
                                if (speechEnabled) {
                                    Homey.manager("speech-output").say(__("speech_already_off"));
                                }
                            }
                        }).finally(function() {
                            harmonyClient.end();
                        });
                });
        });
    },

    /**
     * Initializes hub discovery.
     * 
     * @returns {} 
     */
    discoverHubs: function () {
        
        function hubInList(ipaddress) {
            return listOfHubs.some(function(hub) {
                return hub.ip === ipaddress;
            });
        }
        
        function removeHubFromList(ipaddress) {
            for (var i = listOfHubs.length; i--;) {
                if (listOfHubs[i].ip === ipaddress) {
                    listOfHubs.splice(i, 1);
                }
            }
        }

        discover = new HarmonyHubDiscover(61991);

        discover.on("online", function(hub) {
            // Triggered when a new hub was found
            console.log("online: " + hub.ip);
            if (!hubInList(hub.ip)) {
                listOfHubs.push(hub);
            }
            Homey.manager("api").realtime("hub_online", hub);
            Homey.manager("api").realtime("hubs_update", listOfHubs);
        });

        discover.on("offline", function(hub) {
            // Triggered when a hub disappeared
            console.log("offline: " + hub.ip);
            removeHubFromList(hub.ip);
            Homey.manager("api").realtime("hub_offline", hub);
            Homey.manager("api").realtime("hubs_update", listOfHubs);
        });

        discover.on("update", function(hubs) {
            // Combines the online & update events by returning an array with all known hubs for ease of use.
            var hubIps = hubs.reduce(function(prev, hub) {
                return prev + (prev.length > 0 ? ", " : "") + hub.ip;
            }, "");
            console.log("update: " + hubIps);
            listOfHubs = hubs;
            Homey.manager("api").realtime("hubs_update", listOfHubs);
        });

        discover.start();
        console.log("Listening for hubs...");
    },
    
    /**
     * Stops listening for Hubs on the network.
     * 
     * @returns {} 
     */
    stopListeningForHubs: function () {
        discover.stop();
        console.log("Stopped listening for hubs.");
    },
    
    /**
     * Gets the current list of hubs.
     * 
     * @param {} callback 
     * @returns {} 
     */
    getListOfHubs: function (callback) {
        // Return success
        if (callback) callback(null, listOfHubs);
    },

    /**
     * Start listening again using updated IP address.
     * 
     * @param {} settings 
     * @param {} callback 
     * @returns {} 
     */
    updateSettings: function(settings, callback) {
        // Listen for flow triggers
        self.listenForTriggers(settings.ipaddress, settings.speechEnabled);

        // Return success
        if (callback) callback(null, true);
    }
};