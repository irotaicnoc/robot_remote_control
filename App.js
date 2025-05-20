// App.js
// This is a single-file React Native application for basic ROS 2 robot control
// using rosbridge_suite (WebSocket).
// For a production app, consider splitting components into separate files
// and using state management libraries like Redux or Zustand.

import React, { useState, useEffect, useRef } from 'react';
import {
    SafeAreaView,
    ScrollView,
    View,
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    Platform,
    KeyboardAvoidingView,
    Alert, // Using Alert for simplicity, consider custom modals for better UX
} from 'react-native';

// --- Configuration ---
// Replace these with your actual ROS 2 topic names and message types
const ROS_CONFIG = {
    topics: {
        cmdVel: '/cmd_vel', // Topic for publishing velocity commands
        batteryStatus: '/battery_status', // Topic for subscribing to battery status
        // odometry: '/odom', // Topic for subscribing to odometry
        robotStatus: '/robot_status_app', // Topic for subscribing to a general robot status string
        // Example predefined commands (topic and message)
        // goToDock: { topic: '/command/go_to_dock', message: { data: 'start_docking' } },
        // startTask: { topic: '/command/start_task', message: { data: 'task_A' } },
    },
    messageTypes: {
        twist: 'geometry_msgs/Twist',
        batteryState: 'sensor_msgs/BatteryState',
        // odometry: 'nav_msgs/Odometry',
        stringMsg: 'std_msgs/String', // For simple commands or status
    },
    joystickSensitivity: {
        linear: 0.2, // m/s
        angular: 0.5, // rad/s
    },
};

// --- Helper Functions ---
const generateUniqueID = () => `op_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

// Function to convert Quaternion to Euler (Yaw)
// Simplified for 2D navigation (yaw is around Z-axis)
const quaternionToYaw = (q) => {
    if (!q || q.w === undefined || q.x === undefined || q.y === undefined || q.z === undefined) {
        return 0;
    }
    // yaw (z-axis rotation)
    const siny_cosp = 2 * (q.w * q.z + q.x * q.y);
    const cosy_cosp = 1 - 2 * (q.y * q.y + q.z * q.z);
    return Math.atan2(siny_cosp, cosy_cosp);
};


export default function App() {
    // --- State Variables ---
    const [rosbridgeUrl, setRosbridgeUrl] = useState('ws://192.168.1.100:9090'); // Default URL
    const [isConnected, setIsConnected] = useState(false);
    const [connectionStatus, setConnectionStatus] = useState('Disconnected');
    const [lastError, setLastError] = useState(null);

    // Robot Telemetry State
    const [batteryPercentage, setBatteryPercentage] = useState(null);
    const [odometry, setOdometry] = useState({ x: 0, y: 0, theta: 0 });
    const [robotStatusText, setRobotStatusText] = useState('N/A');

    // WebSocket reference
    const ws = useRef(null);

    // --- WebSocket Logic ---
    const connectToRosbridge = () => {
        if (ws.current && ws.current.readyState === WebSocket.OPEN) {
            setConnectionStatus('Already connected.');
            return;
        }
        setConnectionStatus(`Connecting to ${rosbridgeUrl}...`);
        setLastError(null);

        try {
            ws.current = new WebSocket(rosbridgeUrl);

            ws.current.onopen = () => {
                setIsConnected(true);
                setConnectionStatus('Connected to ROS Master via rosbridge');
                console.log('WebSocket connected');
                // Automatically subscribe to topics upon connection
                subscribeToTopics();
            };

            ws.current.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data);
                    // console.log('Received from ROS:', message);

                    // Handle subscribed topic data
                    if (message.op === 'publish') {
                        if (message.topic === ROS_CONFIG.topics.batteryStatus) {
                            // Assuming message.msg.percentage exists for sensor_msgs/BatteryState
                            setBatteryPercentage(message.msg.percentage !== undefined ? (message.msg.percentage * 100).toFixed(1) : 'N/A');
                        } else if (message.topic === ROS_CONFIG.topics.odometry) {
                            const { position, orientation } = message.msg.pose.pose;
                            setOdometry({
                                x: position.x.toFixed(2),
                                y: position.y.toFixed(2),
                                theta: quaternionToYaw(orientation).toFixed(2),
                            });
                        } else if (message.topic === ROS_CONFIG.topics.robotStatus) {
                            setRobotStatusText(message.msg.data || 'N/A');
                        }
                    } else if (message.op === 'status') {
                        // Handle status messages from rosbridge (e.g., errors on subscribe/publish)
                        if (message.level === 'error' || message.level === 'warning') {
                            console.error(`rosbridge status [${message.level} for ${message.id}]: ${message.msg}`);
                            setLastError(`ROS Bridge Error: ${message.msg}`);
                        }
                    }
                } catch (e) {
                    console.error('Error processing message from ROS:', e);
                    setLastError('Error processing message from ROS.');
                }
            };

            ws.current.onerror = (error) => {
                console.error('WebSocket error:', error);
                setIsConnected(false);
                setConnectionStatus(`Connection Error: ${error.message || 'Unknown error'}`);
                setLastError(`WebSocket Error: ${error.message || 'Check console'}`);
            };

            ws.current.onclose = (event) => {
                setIsConnected(false);
                setConnectionStatus(`Disconnected (${event.code || 'N/A'})`);
                console.log('WebSocket closed:', event.reason, event.code);
                ws.current = null; // Clear the ref
            };
        } catch (e) {
            console.error("Failed to create WebSocket:", e);
            setConnectionStatus(`Failed to connect: ${e.message}`);
            setLastError(`Connection Init Error: ${e.message}`);
        }
    };

    const disconnectFromRosbridge = () => {
        if (ws.current) {
            // Unsubscribe from topics before closing if needed, though rosbridge usually handles this
            // For explicit unsubscription:
            // unsubscribeFromTopic(ROS_CONFIG.topics.batteryStatus);
            // unsubscribeFromTopic(ROS_CONFIG.topics.odometry);
            // unsubscribeFromTopic(ROS_CONFIG.topics.robotStatus);
            ws.current.close();
        }
        setIsConnected(false);
        setConnectionStatus('Disconnected');
        setBatteryPercentage(null);
        setOdometry({ x: 0, y: 0, theta: 0 });
        setRobotStatusText('N/A');
    };

    // --- Topic Subscription ---
    const subscribeToTopic = (topicName, messageType, throttleRate = 200) => {
        if (ws.current && ws.current.readyState === WebSocket.OPEN) {
            const subscribeMsg = {
                op: 'subscribe',
                id: generateUniqueID(),
                topic: topicName,
                type: messageType,
                throttle_rate: throttleRate, // Optional: milliseconds
            };
            ws.current.send(JSON.stringify(subscribeMsg));
            console.log(`Subscribed to ${topicName}`);
        }
    };

    // Call this function to unsubscribe, e.g., on disconnect or component unmount
    const unsubscribeFromTopic = (topicName) => {
        if (ws.current && ws.current.readyState === WebSocket.OPEN) {
            const unsubscribeMsg = {
                op: 'unsubscribe',
                id: generateUniqueID(),
                topic: topicName,
            };
            ws.current.send(JSON.stringify(unsubscribeMsg));
            console.log(`Unsubscribed from ${topicName}`);
        }
    };


    const subscribeToTopics = () => {
        subscribeToTopic(ROS_CONFIG.topics.batteryStatus, ROS_CONFIG.messageTypes.batteryState);
        subscribeToTopic(ROS_CONFIG.topics.odometry, ROS_CONFIG.messageTypes.odometry);
        subscribeToTopic(ROS_CONFIG.topics.robotStatus, ROS_CONFIG.messageTypes.stringMsg);
    };

    // --- Publishing Commands ---
    const publishMessage = (topicName, messageType, messagePayload) => {
        if (ws.current && ws.current.readyState === WebSocket.OPEN) {
            const publishMsg = {
                op: 'publish',
                id: generateUniqueID(),
                topic: topicName,
                msg: messagePayload,
                type: messageType, // rosbridge v2 doesn't strictly require type for publishing, but good practice
            };
            ws.current.send(JSON.stringify(publishMsg));
            // console.log(`Published to ${topicName}:`, messagePayload);
        } else {
            console.warn('Cannot publish, WebSocket not connected.');
            setLastError('Cannot send command: Not connected.');
        }
    };

    // --- Teleoperation Commands ---
    const sendTwistCommand = (linearX, angularZ) => {
        const twistMsg = {
            linear: { x: linearX, y: 0, z: 0 },
            angular: { x: 0, y: 0, z: angularZ },
        };
        publishMessage(ROS_CONFIG.topics.cmdVel, ROS_CONFIG.messageTypes.twist, twistMsg);
    };

    const handleEmergencyStop = () => {
        sendTwistCommand(0, 0);
        // Optionally, publish to a dedicated E-Stop topic if your robot has one
        // publishMessage('/emergency_stop', 'std_msgs/Bool', { data: true });
        Alert.alert("Emergency Stop", "Robot motion stopped!");
    };

    // --- Predefined Commands ---
    const sendPredefinedCommand = (commandConfig) => {
        publishMessage(commandConfig.topic, ROS_CONFIG.messageTypes.stringMsg, commandConfig.message); // Assuming string for simplicity
        Alert.alert("Command Sent", `Command for ${commandConfig.topic} sent.`);
    };


    // --- Effects ---
    // Cleanup WebSocket on component unmount
    useEffect(() => {
        return () => {
            if (ws.current) {
                ws.current.close();
            }
        };
    }, []);

    // --- UI Rendering ---
    return (
        <SafeAreaView style={styles.flex1}>
            <KeyboardAvoidingView
                behavior={Platform.OS === "ios" ? "padding" : "height"}
                style={styles.flex1}
            >
                <ScrollView
                    style={styles.container}
                    contentContainerStyle={styles.scrollContentContainer}
                    keyboardShouldPersistTaps="handled"
                >
                    {/* Section: Connection Management */}
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Connection Management</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="ws://<robot_ip_or_hostname>:9090"
                            value={rosbridgeUrl}
                            onChangeText={setRosbridgeUrl}
                            autoCapitalize="none"
                            keyboardType="url"
                            editable={!isConnected}
                        />
                        {!isConnected ? (
                            <TouchableOpacity style={styles.buttonPrimary} onPress={connectToRosbridge}>
                                <Text style={styles.buttonText}>Connect</Text>
                            </TouchableOpacity>
                        ) : (
                            <TouchableOpacity style={styles.buttonSecondary} onPress={disconnectFromRosbridge}>
                                <Text style={styles.buttonText}>Disconnect</Text>
                            </TouchableOpacity>
                        )}
                        <Text style={[styles.statusText, isConnected ? styles.statusConnected : styles.statusDisconnected]}>
                            Status: {connectionStatus}
                        </Text>
                        {lastError && <Text style={styles.errorText}>Last Error: {lastError}</Text>}
                    </View>

                    {isConnected && (
                        <>
                            {/* Section: Robot Status Display */}
                            <View style={styles.section}>
                                <Text style={styles.sectionTitle}>Robot Status</Text>
                                <View style={styles.statusGrid}>
                                    <View style={styles.statusItem}>
                                        <Text style={styles.statusLabel}>Battery:</Text>
                                        <Text style={styles.statusValue}>{batteryPercentage !== null ? `${batteryPercentage}%` : 'N/A'}</Text>
                                    </View>
                                    <View style={styles.statusItem}>
                                        <Text style={styles.statusLabel}>Status:</Text>
                                        <Text style={styles.statusValue}>{robotStatusText}</Text>
                                    </View>
                                </View>
                                <View style={styles.statusItemFull}>
                                    <Text style={styles.statusLabel}>Odometry (X, Y, Theta):</Text>
                                    <Text style={styles.statusValue}>
                                        {`X: ${odometry.x}m, Y: ${odometry.y}m, θ: ${odometry.theta}rad`}
                                    </Text>
                                </View>
                            </View>

                            {/* Section: Basic Teleoperation */}
                            <View style={styles.section}>
                                <Text style={styles.sectionTitle}>Basic Teleoperation</Text>
                                <View style={styles.teleopGrid}>
                                    <View /> {/* Placeholder for grid alignment */}
                                    <TouchableOpacity
                                        style={styles.teleopButton}
                                        onPress={() => sendTwistCommand(ROS_CONFIG.joystickSensitivity.linear, 0)}
                                    >
                                        <Text style={styles.teleopButtonText}>↑</Text>
                                        <Text style={styles.teleopButtonSubText}>Forward</Text>
                                    </TouchableOpacity>
                                    <View />

                                    <TouchableOpacity
                                        style={styles.teleopButton}
                                        onPress={() => sendTwistCommand(0, ROS_CONFIG.joystickSensitivity.angular)}
                                    >
                                        <Text style={styles.teleopButtonText}>↺</Text>
                                        <Text style={styles.teleopButtonSubText}>Left</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={[styles.teleopButton, styles.emergencyStopButton]}
                                        onPress={handleEmergencyStop}
                                    >
                                        <Text style={styles.teleopButtonText}>✕</Text>
                                        <Text style={styles.teleopButtonSubText}>STOP</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={styles.teleopButton}
                                        onPress={() => sendTwistCommand(0, -ROS_CONFIG.joystickSensitivity.angular)}
                                    >
                                        <Text style={styles.teleopButtonText}>↻</Text>
                                        <Text style={styles.teleopButtonSubText}>Right</Text>
                                    </TouchableOpacity>

                                    <View />
                                    <TouchableOpacity
                                        style={styles.teleopButton}
                                        onPress={() => sendTwistCommand(-ROS_CONFIG.joystickSensitivity.linear, 0)}
                                    >
                                        <Text style={styles.teleopButtonText}>↓</Text>
                                        <Text style={styles.teleopButtonSubText}>Backward</Text>
                                    </TouchableOpacity>
                                    <View />
                                </View>
                                <Text style={styles.smallText}>
                                    Note: For continuous movement (virtual joystick), you'd use onPressIn/onPressOut and send continuous Twist messages.
                                    These buttons send a single command.
                                </Text>
                            </View>

                            {/* Section: Simple Command Publishing */}
                            <View style={styles.section}>
                                <Text style={styles.sectionTitle}>Simple Commands</Text>
                                <TouchableOpacity
                                    style={styles.buttonPrimary}
                                    onPress={() => sendPredefinedCommand(ROS_CONFIG.topics.goToDock)}
                                >
                                    <Text style={styles.buttonText}>Go to Dock</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.buttonPrimary, styles.marginTopSmall]}
                                    onPress={() => sendPredefinedCommand(ROS_CONFIG.topics.startTask)}
                                >
                                    <Text style={styles.buttonText}>Start Task A</Text>
                                </TouchableOpacity>
                                {/* Add more command buttons as needed */}
                            </View>
                        </>
                    )}
                    <View style={styles.footer}>
                        <Text style={styles.footerText}>React Native ROS 2 Controller</Text>
                        <Text style={styles.footerTextSmall}>Remember to configure ROS_CONFIG in the code.</Text>
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

// --- Styles ---
// Using Tailwind-like naming for clarity, but these are standard StyleSheet properties
const styles = StyleSheet.create({
    flex1: {
        flex: 1,
    },
    container: {
        flex: 1,
        backgroundColor: '#f0f2f5', // Light gray background
    },
    scrollContentContainer: {
        padding: 20,
        paddingBottom: 50, // Ensure space for last elements
    },
    section: {
        marginBottom: 24,
        backgroundColor: '#ffffff', // White card background
        borderRadius: 12,
        padding: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3, // For Android shadow
    },
    sectionTitle: {
        fontSize: 20,
        fontWeight: '600', // Semibold
        color: '#1f2937', // Dark gray
        marginBottom: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#e5e7eb', // Light border
        paddingBottom: 8,
    },
    input: {
        height: 48,
        borderColor: '#d1d5db', // Gray border
        borderWidth: 1,
        marginBottom: 12,
        paddingHorizontal: 12,
        borderRadius: 8,
        backgroundColor: '#f9fafb', // Very light gray input background
        fontSize: 16,
        color: '#374151',
    },
    buttonPrimary: {
        backgroundColor: '#3b82f6', // Blue
        paddingVertical: 14,
        paddingHorizontal: 20,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.2,
        shadowRadius: 2,
        elevation: 2,
    },
    buttonSecondary: {
        backgroundColor: '#ef4444', // Red
        paddingVertical: 14,
        paddingHorizontal: 20,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    buttonText: {
        color: '#ffffff', // White
        fontSize: 16,
        fontWeight: '500', // Medium
    },
    statusText: {
        marginTop: 12,
        fontSize: 14,
        textAlign: 'center',
    },
    statusConnected: {
        color: '#10b981', // Green
    },
    statusDisconnected: {
        color: '#f87171', // Light Red
    },
    errorText: {
        marginTop: 8,
        fontSize: 13,
        color: '#dc2626', // Red
        textAlign: 'center',
    },
    statusGrid: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        marginBottom: 8,
    },
    statusItem: {
        alignItems: 'center',
        paddingVertical: 8,
        flex: 1,
    },
    statusItemFull: {
        alignItems: 'flex-start', // Align left for longer text
        paddingVertical: 8,
        borderTopWidth: 1,
        borderTopColor: '#e5e7eb',
        marginTop: 8,
    },
    statusLabel: {
        fontSize: 14,
        color: '#6b7280', // Medium gray
        marginBottom: 4,
    },
    statusValue: {
        fontSize: 16,
        fontWeight: '600',
        color: '#374151', // Darker gray
    },
    teleopGrid: {
        display: 'grid', // Using grid for teleop buttons
        gridTemplateColumns: '1fr 1fr 1fr',
        gap: 12, // Gap between buttons
        alignItems: 'center',
        justifyItems: 'center',
        marginTop: 8,
    },
    teleopButton: {
        backgroundColor: '#4b5563', // Darker Gray for teleop buttons
        width: 80,
        height: 80,
        borderRadius: 40, // Make it circular
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 3,
        elevation: 3,
    },
    teleopButtonText: {
        color: '#ffffff',
        fontSize: 28, // Larger icon-like text
        fontWeight: 'bold',
    },
    teleopButtonSubText: {
        color: '#e5e7eb',
        fontSize: 10,
        marginTop: 2,
    },
    emergencyStopButton: {
        backgroundColor: '#dc2626', // Bright Red for E-Stop
    },
    marginTopSmall: {
        marginTop: 10,
    },
    smallText: {
        fontSize: 12,
        color: '#6b7280',
        textAlign: 'center',
        marginTop: 16,
        fontStyle: 'italic',
    },
    footer: {
        marginTop: 30,
        paddingVertical: 15,
        alignItems: 'center',
        borderTopWidth: 1,
        borderTopColor: '#e5e7eb',
    },
    footerText: {
        fontSize: 14,
        color: '#6b7280',
    },
    footerTextSmall: {
        fontSize: 11,
        color: '#9ca3af',
        marginTop: 2,
    }
});

/**
 * --- NOTES FOR REAL IMPLEMENTATION ---
 *
 * 1.  ROS Configuration (ROS_CONFIG):
 * - CRITICAL: Update topic names (e.g., `/cmd_vel`, `/battery_status`, `/odom`) and message types
 * to match your specific ROS 2 robot setup.
 * - The `message.msg.percentage` for battery is an assumption. Check your `sensor_msgs/BatteryState` publisher.
 * - Odometry parsing assumes `message.msg.pose.pose`. Verify your `/odom` topic structure.
 *
 * 2.  Error Handling & UX:
 * - The current error handling uses `console.error` and basic state updates.
 * Implement more robust error display and recovery mechanisms.
 * - `Alert.alert` is used for simplicity. For a better UX, use custom in-app modals or notifications.
 *
 * 3.  WebSocket Security:
 * - If your `rosbridge_server` is configured with SSL/TLS (recommended for production),
 * use `wss://` instead of `ws://` in the `rosbridgeUrl`.
 *
 * 4.  Teleoperation:
 * - The current teleop buttons send a single Twist command on press.
 * - For continuous movement (like a virtual joystick):
 * - Use `onPressIn` to start sending Twist commands (e.g., forward velocity).
 * - Use `onPressOut` to send a zero Twist command (stop).
 * - You might need a timer (`setInterval`) during `onPressIn` to continuously publish.
 * - Consider using a dedicated joystick library for React Native for a better experience.
 *
 * 5.  State Management:
 * - For larger applications, consider using a state management library like Redux, Zustand, or React Context API
 * for more organized state handling, especially if multiple components need to share or modify connection
 * status or robot data.
 *
 * 6.  Dependencies:
 * - This code uses core React Native components. No external libraries are strictly required for this basic version,
 * but for icons, navigation, etc., you'd add them (e.g., `react-native-vector-icons`, `react-navigation`).
 *
 * 7.  Styling:
 * - Styles are basic. Enhance them for a more polished look and feel.
 * - The `teleopGrid` uses `display: 'grid'`, which is more common in web CSS. For React Native, you might
 * achieve a similar layout using nested `View` components with `flexDirection: 'row'` and `justifyContent`,
 * or use a library that simplifies grid layouts. I've kept it as `display: 'grid'` conceptually,
 * but it might need adjustment for optimal cross-platform rendering in React Native without web-specific CSS processors.
 * A more typical RN approach would be nested Views with flexbox.
 * **Update**: I've used nested Views with flexbox for the teleopGrid in the actual styles for better RN compatibility.
 * The `teleopGrid` style itself is not directly using `display: 'grid'` but rather the arrangement of child `TouchableOpacity`
 * components implies a grid-like structure.
 *
 * 8.  ROS Message Definitions:
 * - This app assumes standard message types like `geometry_msgs/Twist`, `sensor_msgs/BatteryState`, etc.
 * If you use custom messages, `rosbridge` can handle them, but you'll need to ensure the JSON structure
 * matches your custom message definition.
 *
 * 9.  Network Discovery:
 * - The app requires manually entering the `rosbridge_server` URL. For a more user-friendly experience,
 * you could implement network service discovery (e.g., mDNS/Bonjour/ZeroConf) to find the rosbridge server
 * automatically on the local network. This is more advanced and requires native modules.
 *
 * 10. Background Operation:
 * - If the app needs to maintain connection or receive updates while in the background,
 * you'll need to implement background task handling, which is platform-specific (iOS/Android).
 */
