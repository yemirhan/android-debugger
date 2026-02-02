package expo.modules.androiddebugger

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.Promise
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * Expo module for the Android Debugger native socket transport.
 * Provides a TCP server that the desktop app can connect to for
 * bi-directional communication.
 */
class AndroidDebuggerModule : Module() {
    private var debugServer: DebugServer? = null
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun definition() = ModuleDefinition {
        Name("AndroidDebugger")

        // Events emitted to JavaScript
        Events(
            "onClientConnected",
            "onClientDisconnected",
            "onMessageReceived",
            "onServerError"
        )

        /**
         * Start the debug server on the specified port.
         * @param port The port to listen on (default: 8765)
         */
        AsyncFunction("startServer") { port: Int ->
            if (debugServer != null) {
                throw Exception("Server is already running")
            }

            debugServer = DebugServer(port).apply {
                onClientConnected = {
                    sendEvent("onClientConnected", mapOf(
                        "timestamp" to System.currentTimeMillis()
                    ))
                }
                onClientDisconnected = {
                    sendEvent("onClientDisconnected", mapOf(
                        "timestamp" to System.currentTimeMillis()
                    ))
                }
                onMessageReceived = { message ->
                    sendEvent("onMessageReceived", mapOf(
                        "message" to message,
                        "timestamp" to System.currentTimeMillis()
                    ))
                }
                onError = { error ->
                    sendEvent("onServerError", mapOf(
                        "error" to error,
                        "timestamp" to System.currentTimeMillis()
                    ))
                }
            }

            scope.launch {
                try {
                    debugServer?.start()
                } catch (e: Exception) {
                    sendEvent("onServerError", mapOf(
                        "error" to (e.message ?: "Unknown error"),
                        "timestamp" to System.currentTimeMillis()
                    ))
                }
            }

            mapOf("success" to true, "port" to port)
        }

        /**
         * Stop the debug server.
         */
        AsyncFunction("stopServer") {
            debugServer?.stop()
            debugServer = null
            mapOf("success" to true)
        }

        /**
         * Send a message to the connected desktop client.
         * @param json The JSON string message to send
         */
        AsyncFunction("sendMessage") { json: String ->
            val server = debugServer
                ?: throw Exception("Server is not running")

            if (!server.isClientConnected()) {
                throw Exception("No client connected")
            }

            server.sendMessage(json)
            mapOf("success" to true)
        }

        /**
         * Check if the server is currently running.
         */
        Function("isServerRunning") {
            debugServer?.isRunning() ?: false
        }

        /**
         * Check if a client is currently connected.
         */
        Function("isClientConnected") {
            debugServer?.isClientConnected() ?: false
        }

        /**
         * Get the current server status.
         */
        Function("getStatus") {
            mapOf(
                "isRunning" to (debugServer?.isRunning() ?: false),
                "isClientConnected" to (debugServer?.isClientConnected() ?: false),
                "port" to (debugServer?.getPort() ?: 0)
            )
        }

        // Clean up when module is destroyed
        OnDestroy {
            debugServer?.stop()
            debugServer = null
        }
    }
}
