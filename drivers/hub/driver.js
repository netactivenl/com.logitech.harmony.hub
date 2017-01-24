"use strict";
var moment = require("moment");
var HarmonyHubDiscover = require("harmonyhubjs-discover");
var Harmony = require("harmonyhubjs-client");

// Keeps a reference to discover.
var Discover;

// a list of devices, with their 'id' as key
// it is generally advisable to keep a list of
// paired and active devices in your driver's memory.
var Hubs = {};
var Clients = {};

module.exports.init = function(devices_data, callback) {
    // ATHOM: When the driver starts, Homey rebooted. Initialize all previously paired devices.
    Log("Previously paired " + devices_data.length + " hub(s).");
    //Log(JSON.stringify(devices_data));
    
    if (devices_data.length > 0) {
        // Discover hubs currently on the network.
        StartHubDiscovery(function(error, hubs) {
            StopHubDiscovery();

            Log("Discovered " + hubs.length + " hub(s).");
            //Log(JSON.stringify(hubs));

            devices_data.forEach(function(device_data) {
                // ATHOM: Do something here to initialise the device, e.g. start a socket connection.
                Log("Finding previously paired hub with id: " + device_data.id);

                // Find out if this previously paired hub was discovered on the network.
                var hubDiscovered = hubs.some(function(hub) {
                    if (hub.uuid === device_data.id) {
                        // Override previous ipaddress.
                        device_data.ip = hub.ip;
                        return true;
                    } else {
                        return false;
                    }
                });

                if (hubDiscovered) {
                    // Initialize the previously paired hub.
                    InitDevice(device_data, function(error) {
                        if (error) {
                            callback(error);
                        }
                    });
                } else {
                    var error = "Hub with Id '" +
                        device_data.Id +
                        "' not found. Possibly the Hub is currently unreachable or its internal Id has changed. Please try removing your hub and re-adding it.";
                    LogError(error);
                    callback(error);
                }
            });
        });
    }

    // ATHOM: Let Homey know the driver is ready.
    if (callback) callback();
}

module.exports.added = function(device_data, callback) {
    // ATHOM: run when a device has been added by the user (as of v0.8.33)
    InitDevice(device_data);
    callback(null, true);
}

module.exports.renamed = function(device_data, new_name) {
    // ATHOM: run when the user has renamed the device in Homey.
    // It is recommended to synchronize a device's name, so the user is not confused
    // when it uses another remote to control that device (e.g. the manufacturer's app).
}

module.exports.deleted = function(device_data, callback) {
    // ATHOM: run when the user has deleted the device from Homey
    GetClient(device_data.id,
        function(error, client) {
            if (error) {
                Log("ERROR: " + JSON.stringify(error));
                callback(error, null);
            } else {
                // Stop refreshing the current activity.
                clearInterval(Clients[device_data.id].interval);

                // Disconnect from the hub.
                client.end();
                Log("Disconnected from device.");
            }
        });

    delete Hubs[device_data.id];
    delete Clients[device_data.id];
    callback(null, true);
}

module.exports.settings = function(device_data, newSettingsObj, oldSettingsObj, changedKeysArr, callback) {
    // ATHOM: see settings
}

module.exports.pair = function(socket) {
    // `socket` is a direct channel to the front-end
    // Note: objects will be JSON stringified, so don't use special object such as Error or Buffer.

    // this method is run when Homey.emit('start') is run on the front-end
    socket.on('start',
        function(data, callback) {
            Log("Pairing started...");

            // fire the callback (you can only do this once)
            // ( err, result )
            callback(null, 'Started!');

            // send a message to the front-end, even after the callback has fired
            //setTimeout(function () {
            //    socket.emit("hello", "Hello to you!", function (err, result) {
            //        Log(result); // result is `Hi!`
            //    });
            //}, 2000);
        });

    // this method is run when Homey.emit('list_devices') is run on the front-end
    // which happens when you use the template `list_devices`
    socket.on("list_devices",
        function(data, callback) {
            StartHubDiscovery(function(error, hubs) {
                if (error) {
                    Log(error);
                    StopHubDiscovery();

                    callback(error, null);
                } else {
                    Log("Discovered " + hubs.length + " hub(s).");
                    //Log(JSON.stringify(hubs));

                    StopHubDiscovery();

                    var listOfDevices = [];
                    hubs.forEach(function(hub) {
                        listOfDevices.push(MapHubToDeviceData(hub));
                    });
                    //Log(JSON.stringify(listOfDevices));

                    // err, result style
                    callback(null, listOfDevices);

                    // TODO: even when we found another device, these can be shown in the front-end
                    //setTimeout(function() {
                    //        socket.emit("list_devices", listOfDevices);
                    //    },
                    //    2000);
                }
            });
        });

    // ATHOM: User aborted pairing, or pairing is finished.
    socket.on("disconnect",
        function() {
            Log("User aborted pairing, or pairing is finished");
        });
}

module.exports.capabilities = {
    activity: {
        // ATHOM: this function is called by Homey when it wants to GET the current activity, e.g. when the user loads the smartphone interface.
        // `device_data` is the object as saved during pairing.
        // `callback` should return the current value in the format callback( err, value ).
        get: function(device_data, callback) {
            // ATHOM: get the hub with a locally defined function.
            var device = GetHubByData(device_data);
            if (device instanceof Error) return callback(device);

            // ATHOM: send the current activity to Homey.
            callback(null, device.activity.name);
        },

        // ATHOM: this function is called by Homey when it wants to SET the current activity, e.g. when the user says 'watch tv'.
        // `device_data` is the object as saved during pairing.
        // `activity` is the new value.
        // `callback` should return the new value in the format callback( err, value ).
        set: function(device_data, activity, callback) {
            var device = GetHubByData(device_data);
            if (device instanceof Error) return callback(device);

            // TODO: Get the current hub activity.
            var currentActivity = null;

            // ATHOM: Set the new activity, only when if differs from the current.
            if (currentActivity !== activity) {
                // TODO: Set the new activity here.
                module.exports.realtime(device_data, 'activity', activity);
                updateHub(device_data.id);
            }

            // TODO: Refresh the current hub activity.
            currentActivity = null;

            // ATHOM: send the new activity value to Homey.
            callback(null, currentActivity);
        }
    }
}

module.exports.autocompleteActivity = function(args, callback) {
    if (args.query.length > 0) {
        Log("Finding activity '" + args.query + "' on " + args.args.hub.ip + "...");
    } else {
        Log("Finding activities on " + args.args.hub.ip + "...");
    }

    //Homey.log(JSON.stringify(args));

    GetClient(args.args.hub.id,
        function(error, client) {
            if (error) {
                Log("ERROR: " + JSON.stringify(error));
                callback(error, null);
            } else {
                client.getActivities()
                    .then(function(activities) {
                            var listOfActivities = [];
                            activities.forEach(function(activity) {
                                if (activity.isAVActivity &&
                                (args.query.length === 0 ||
                                    activity.label.toUpperCase().indexOf(args.query.toUpperCase()) !== -1)) {
                                    activity.name = activity.label;
                                    activity.icon = activity.baseImageUri + activity.imageKey;
                                    activity.hub = args.args.hub;
                                    listOfActivities.push(activity);
                                }
                            });
                            callback(null, listOfActivities.sortBy("activityOrder"));
                        },
                        function(error) {
                            LogError("Get activities failed: " + JSON.stringify(error));
                            callback(error, null);
                        });
            }
        });
};

module.exports.autocompleteDevice = function(args, callback) {
    if (args.query.length > 0) {
        Log("Finding device '" + args.query + "' on " + args.args.hub.ip + "...");
    } else {
        Log("Finding device on " + args.args.hub.ip + "...");
    }

    //Homey.log(JSON.stringify(args));

    GetClient(args.args.hub.id,
        function(error, client) {
            if (error) {
                Log("ERROR: " + JSON.stringify(error));
                callback(error, null);
            } else {
                GetDevices(client,
                    function(devices) {
                        var listOfDevices = [];
                        devices.forEach(function(device) {
                            if ((args.query.length === 0 ||
                                device.label.toUpperCase().indexOf(args.query.toUpperCase()) !== -1)) {
                                listOfDevices.push(device);
                            }
                        });
                        callback(null, listOfDevices.sortBy("name"));
                    });
            }
        });
};

module.exports.startActivity = function (args, callback) {
    Log("Starting activity '" + args.activity.name + "' on " + args.hub.ip + "...");

    GetClient(args.hub.id,
        function(error, client) {
            if (error) {
                Log("ERROR: " + JSON.stringify(error));
                callback(error, null);
            } else {
                client.isOff()
                    .then(function(off) {
                            if (off) {
                                Log("- Hub status: off");
                                Log("Starting activity...");
                                StartActivity(function(error, started) {
                                        if (error) {
                                            Log("Starting activity failed: ");
                                            Log(JSON.stringify(error));
                                            callback(error, null);
                                        } else {
                                            callback(null, started);
                                        }
                                    },
                                    client,
                                    args.activity.id);
                            } else {
                                Log("- Hub status: on");
                                client.getCurrentActivity()
                                    .then(function(currentActivityId) {
                                            Log("Current activity id: " + currentActivityId);
                                            Log("Requested activity id: " + args.activity.id);
                                            if (currentActivityId !== args.activity.id) {
                                                Log("Switching activity...");
                                                StartActivity(function(error, started) {
                                                        if (error) {
                                                            Log("Switching activity failed: ");
                                                            Log(JSON.stringify(error));
                                                            callback(error, null);
                                                        } else {
                                                            callback(null, started);
                                                        }
                                                    },
                                                    client,
                                                    args.activity.id);
                                            } else {
                                                Log("Requested activity already selected.");
                                                callback(null, true);
                                            }
                                        },
                                        function(error) {
                                            LogError("Get current activity failed: " + JSON.stringify(error));
                                            callback(error, null);
                                        });
                            }
                        },
                        function(error) {
                            LogError("Unable to determine client state: " + JSON.stringify(error));
                            callback(error, null);
                        });
            }
        });
};

module.exports.sendCommandToDevice = function (args, callback) {
    Log("Sending action to " + args.hub.ip + "...");

    //Log(JSON.stringify(args.action));

    GetClient(args.hub.id,
        function(error, client) {
            if (error) {
                Log("ERROR: " + JSON.stringify(error));
                callback(error, null);
            } else {
                var actionSent = SendAction(client, args.action.action);
                callback(null, actionSent);
            }
        });
};

module.exports.allOff = function(args, callback) {
    Log("Turning all devices off on " + args.hub.ip + "...");

    GetClient(args.hub.id,
        function(error, client) {
            if (error) {
                callback(error, null);
            } else {
                client.isOff()
                    .then(function (off) {
                        if (!off) {
                            var turnedOff = TurnOff(client);
                            callback(null, turnedOff);
                        }
                    },
                    function (error) {
                        Log("Unable to determine client state: ");
                        Log(JSON.stringify(error));
                        callback(error, null);
                    });
            }
        });
};

/**
 * ATHOM: a helper method to get a device from the devices list by it's device_data object.
 * 
 * @param {} device_data
 */
function GetHubByData(device_data) {
    var device = Hubs[device_data.id];
    if (typeof device === 'undefined') {
        return new Error("invalid_device");
    } else {
        return device;
    }
}

/**
 * ATHOM: a helper method to add a device to the devices list.
 * 
 * @param {} device_data
 */
function InitDevice(device_data, callback) {
    Log("Initializing device...");
    //Log(JSON.stringify(device_data));

    // Add hub to list of devices.
    Hubs[device_data.id] = {};
    Hubs[device_data.id].data = device_data;
    Clients[device_data.id] = {};
    Clients[device_data.id].ip = device_data.ip;

    Log("Device and client initialized. Connecting...");

    // Open a connection to the hub and get the current hub activity.
    Harmony(device_data.ip)
        .then(function(harmonyClient) {
                LogError(__("errors.client_connected"));

                harmonyClient._xmppClient.on("error",
                    function (e) {
                        LogError("Client for hub " + device_data.id + " reported an error: ", e);
                    });

                harmonyClient._xmppClient.on("offline",
                    function () {
                        // Re-establish connection in X seconds.
                        var reconnectIntervalInSeconds = Homey.manager("settings").get("reconnect_interval") || 10;
                        LogError(__("errors.client_disconnected").replace("{0}", reconnectIntervalInSeconds));
                        setTimeout(function() { InitDevice(device_data); }, reconnectIntervalInSeconds * 1000);
                    });

                harmonyClient.on("stateDigest",
                    function(stateDigest) {
                        HandleStateChange(stateDigest, device_data);
                    });

                Clients[device_data.id].client = harmonyClient;

                // Refresh list of activities.
                GetDeviceActivities(device_data.id, function(error, activities) {
                    if (error) {
                        Log("ERROR: " + JSON.stringify(error));
                        callback(error);
                    } else {
                        Clients[device_data.id].activities = activities;
                    }
                });
            },
            function(error) {
                LogError("Connecting to hub failed: " + JSON.stringify(error));
                callback(error);
            });
}

/**
 * Refreshes the list of activities for the Hub with the given Id.
 * 
 * @param {} device_data_id
 */
function GetDeviceActivities(device_data_id, callback) {
    Log("Refreshing activities for device " + device_data_id + "...");

    GetClient(device_data_id,
        function (error, client) {
            if (error) {
                Log("ERROR: " + JSON.stringify(error));
                callback(error, null);
            } else {
                client.getActivities()
                    .then(function (activities) {
                        Log("Refreshed activities for device " + device_data_id + ": " + activities.length + " found.");
                        callback(null, activities);
                    },
                    function(error) {
                        LogError("Get activities failed: " + JSON.stringify(error));
                        callback(error, null);
                    });
            }
        });
}

/**
 * Gets the name of the activity with the given Id.
 * 
 * @param {} device_data_id
 * @param {} activityId
 * @param {} callback
 */
function GetActivityName(device_data_id, activityId, callback) {
    if (Clients[device_data_id].activities) {
        Clients[device_data_id].activities.forEach(function (activity) {
            if (activity.id === activityId) {
                if (callback) callback(null, activity.label);
            }
        });
    }
}

/**
 * Maps hub details to device_data object.
 * 
 * @param {} hub
 * @returns {} device_data
 */
function MapHubToDeviceData(hub) {
    return {
        name: hub.friendlyName,
        data: {
            // this data object is saved to- and unique for the device. It is passed on the get and set functions as 1st argument
            id: hub.uuid, // something unique, so your driver knows which physical device it is. A MAC address or Node ID, for example. This is required
            name: hub.host_name,
            friendlyName: hub.friendlyName,
            ip: hub.ip
        },
        //capabilities: [ "activity" ]
    };
}

/**
 * Initializes Hub discovery.
 * 
 * @param callback
 */
function StartHubDiscovery(callback) {

    var listOfHubs = [];

    function hubInList(uuid) {
        return listOfHubs.some(function(hub) {
            return hub.uuid === uuid;
        });
    }

    Discover = new HarmonyHubDiscover(61991);

    //discover.on("online",
    //    function(hub) {
    //    // Triggered when a new hub was found.

    //    // Log IP address of hub we found.
    //        Log("online: " + hub.ip);
    //        Log(JSON.stringify(hub));

    //        if (!hubInList(hub.ip)) {
    //            listOfHubs.push(hub);
    //            if (callback) callback(null, listOfHubs);
    //        }
    //    });

    Discover.on("update",
        function(hubs) {
            // Combines the online & update events by returning an array with all known hubs for ease of use.
            hubs.forEach(function(hub) {
                if (!hubInList(hub.uuid)) {
                    listOfHubs.push(hub);
                }
            });

            if (callback) callback(null, listOfHubs);
        });

    Log("Discovering hubs...");
    Discover.start();
}

/**
* Stops listening for Hubs on the network.
* 
* @returns {} 
*/
function StopHubDiscovery() {
    if (Discover) {
        Discover.stop();
    }

    Log("Stopped listening for hubs.");
}

/**
 * Gets a list of devices, returned through the specified callback method.
 * 
 * @param {} client 
 * @param {} callback 
 * @returns {} 
 */
function GetDevices(client, callback) {
    client.getAvailableCommands()
        .then(function(commands) {
                var listOfDevices = [];
                commands.device.forEach(function(device) {
                    Log("Found device " + device.id + ": " + device.label);
                    //device.icon = "";
                    device.name = device.label;
                    device.description = device.model;
                    listOfDevices.push(device);
                });
                if (callback) callback(listOfDevices);
            },
            function(error) {
                LogError("Get devices failed: " + JSON.stringify(error));
                callback(error, null);
            });
}

/**
 * Starts the specified activity through the given harmony client.
 * 
 * @param {} client 
 * @param {} activityName 
 * @returns {} true/false
 */
function StartActivity(callback, client, activityId) {
    client.getActivities()
        .then(function(activities) {
                var started = activities.some(function(activity) {
                    if (activity.id === activityId) {
                        // Found the activity we want.
                        client.startActivity(activity.id);
                        return true;
                    } else {
                        return false;
                    }
                });

                callback(null, started);
            },
            function(error) {
                LogError("Get activities failed: " + JSON.stringify(error));
                callback(error, null);
            });
}

/**
 * Sends the specified command through the given harmony client.
 * 
 * @param {} client 
 * @param {} action 
 * @returns {} true/false 
 */
function SendAction(client, action) {
    var encodedAction = action.replace(/\:/g, "::");
    client.send("holdAction", "action=" + encodedAction + ":status=press");
    Log("Action sent.");
    return true;
}

/**
 * Handles a state digest by raising appropriate events.
 * 
 * @param {} stateDigest
 * @param {} device_data
 */
function HandleStateChange(stateDigest, device_data) {
    switch (stateDigest.activityStatus) {
    case 0:
        if (stateDigest.runningActivityList.length === 0) {
            Homey.manager("flow").trigger("all_turned_off", { hub_name: device_data.name });
            Log("Activity: Stopped.");
        } else {
            GetActivityName(device_data.id,
                stateDigest.runningActivityList,
                function(error, activityName) {
                    Homey.manager("flow")
                        .trigger("activity_stopping", { hub_name: device_data.name, activity: activityName });
                    Log("Activity '" + activityName + "' (" + stateDigest.runningActivityList + "): Stopping...");
                });
        }
        break;
    case 1:
        GetActivityName(device_data.id,
            stateDigest.activityId,
            function (error, activityName) {
                Homey.manager("flow")
                    .trigger("activity_start_requested", { hub_name: device_data.name, activity: activityName });
                Log("Activity '" + activityName + "' (" + stateDigest.activityId + "): Start requested.");
            });
        break;
    case 2:
        if (stateDigest.activityId === stateDigest.runningActivityList) {
            GetActivityName(device_data.id,
                stateDigest.runningActivityList,
                function (error, activityName) {
                    Homey.manager("flow")
                        .trigger("activity_started", { hub_name: device_data.name, activity: activityName });
                    Log("Activity '" + activityName + "' (" + stateDigest.runningActivityList + "): Started.");
                });
        } else {
            GetActivityName(device_data.id,
                stateDigest.activityId,
                function (error, activityName) {
                    Homey.manager("flow")
                        .trigger("activity_starting", { hub_name: device_data.name, activity: activityName });
                    Log("Activity '" + activityName + "' (" + stateDigest.activityId + "): Starting...");
                });
        }
        break;
    case 3:
        GetActivityName(device_data.id,
            stateDigest.runningActivityList,
            function (error, activityName) {
                Homey
                    .manager("flow")
                    .trigger("activity_stop_requested", { hub_name: device_data.name, activity: activityName });
                Log("Activity '" + activityName + "' (" + stateDigest.runningActivityList + "): Stop requested.");
            });
        break;
    default:
        Log("ATTENTION: Unhandled state digest:");
        Log(JSON.stringify(stateDigest));
        break;
    }
}

/**
 * Turns off all devices through the given harmony client.
 * 
 * @param {} harmonyClient 
 * @returns {} true/false
 */
function TurnOff(client) {
    client.turnOff();
    Log("All devices turned off.");
    return true;
}

/**
 * Gets the Client for the Hub with the given Id.
 * 
 * @param {} device_data_id
 * @param {} callback
 */
function GetClient(device_data_id, callback) {
    var client = null;
    var clientStruct = Clients[device_data_id];
    var error;
    if (!clientStruct) {
        error = "Hub with Id '" + device_data_id + "' not found. Possibly the Hub is currently unreachable or its internal Id has changed. Please try removing your hub and re-adding it.";
    } else {
        error = null;
    }

    if (!error) {
        client = clientStruct.client;
    }

    if (!client) {
        error = "Client for Hub with Id '" + device_data_id + "' not available (yet). Please try again in 10 seconds or so...";
    }

    callback(error, client);
}

/**
 * Logs the given message (to the console and by voice, if enabled).
 * 
 * @param message
 */
function LogError(message) {
    var enableSpeech = Homey.manager("settings").get("enable_speech") || false;
    if (enableSpeech) {
        Homey.manager("speech-output").say(message);
    }

    Log(message);
}

/**
 * Logs the given message (to the console).
 * 
 * @param message
 */
function Log(message) {
    Homey.log(moment().format("HH:mm:ss.SSS") + " - " + message);
}

Array.prototype.sortBy = function (p) {
    return this.slice(0).sort(function (a, b) {
        return (a[p] > b[p]) ? 1 : (a[p] < b[p]) ? -1 : 0;
    });
}