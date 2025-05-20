// components/ConnectionManager.js
import React from 'react';
import { View, Text, TextInput, TouchableOpacity } from 'react-native';

export default function ConnectionManager({
                                              rosbridgeUrl, setRosbridgeUrl, isConnected, connectionStatus, lastError,
                                              onConnect, onDisconnect, styles
                                          }) {
    return (
        <View style={styles.section}>
            <Text style={styles.sectionTitle}>Connection Management</Text>
            <TextInput
                style={styles.input}
                placeholder="ws://<robot_ip>:9090"
                value={rosbridgeUrl}
                onChangeText={setRosbridgeUrl}
                editable={!isConnected}
            />
            {!isConnected ? (
                <TouchableOpacity style={styles.buttonPrimary} onPress={onConnect}>
                    <Text style={styles.buttonText}>Connect</Text>
                </TouchableOpacity>
            ) : (
                <TouchableOpacity style={styles.buttonSecondary} onPress={onDisconnect}>
                    <Text style={styles.buttonText}>Disconnect</Text>
                </TouchableOpacity>
            )}
            <Text style={styles.statusText}>Status: {connectionStatus}</Text>
            {lastError && <Text style={styles.errorText}>Last Error: {lastError}</Text>}
        </View>
    );
}