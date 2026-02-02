package expo.modules.androiddebugger

import android.util.Log
import kotlinx.coroutines.*
import java.io.*
import java.net.ServerSocket
import java.net.Socket
import java.net.SocketException
import java.nio.charset.StandardCharsets
import java.util.concurrent.ConcurrentLinkedQueue
import java.util.concurrent.atomic.AtomicBoolean

/**
 * TCP server for the Android Debugger that handles bi-directional
 * communication with the desktop app.
 *
 * Protocol:
 * - Each message is a JSON string terminated by a newline (\n)
 * - Messages are length-prefixed: 4-byte big-endian length + payload
 */
class DebugServer(private val port: Int = 8765) {
    companion object {
        private const val TAG = "AndroidDebugger"
        private const val MAX_MESSAGE_SIZE = 10 * 1024 * 1024 // 10MB max message size
    }

    private var serverSocket: ServerSocket? = null
    private var clientSocket: Socket? = null
    private var outputStream: DataOutputStream? = null
    private var inputStream: DataInputStream? = null

    private val isRunningFlag = AtomicBoolean(false)
    private val isClientConnectedFlag = AtomicBoolean(false)

    private val messageQueue = ConcurrentLinkedQueue<String>()
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    // Callbacks
    var onClientConnected: (() -> Unit)? = null
    var onClientDisconnected: (() -> Unit)? = null
    var onMessageReceived: ((String) -> Unit)? = null
    var onError: ((String) -> Unit)? = null

    /**
     * Start the server and begin accepting connections.
     */
    suspend fun start() = withContext(Dispatchers.IO) {
        if (isRunningFlag.get()) {
            Log.w(TAG, "Server is already running")
            return@withContext
        }

        try {
            serverSocket = ServerSocket(port)
            isRunningFlag.set(true)
            Log.i(TAG, "Debug server started on port $port")

            // Start accepting connections
            acceptConnections()
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start server: ${e.message}")
            onError?.invoke("Failed to start server: ${e.message}")
            stop()
            throw e
        }
    }

    /**
     * Stop the server and disconnect any clients.
     */
    fun stop() {
        isRunningFlag.set(false)

        try {
            disconnectClient()
            serverSocket?.close()
            serverSocket = null
            scope.cancel()
            Log.i(TAG, "Debug server stopped")
        } catch (e: Exception) {
            Log.e(TAG, "Error stopping server: ${e.message}")
        }
    }

    /**
     * Send a message to the connected client.
     * @param json The JSON message to send
     */
    @Synchronized
    fun sendMessage(json: String) {
        if (!isClientConnectedFlag.get()) {
            // Queue the message if not connected (up to 100 messages)
            if (messageQueue.size < 100) {
                messageQueue.add(json)
            }
            return
        }

        try {
            val output = outputStream ?: return
            val bytes = json.toByteArray(StandardCharsets.UTF_8)

            // Write length-prefixed message
            output.writeInt(bytes.size)
            output.write(bytes)
            output.flush()
        } catch (e: Exception) {
            Log.e(TAG, "Error sending message: ${e.message}")
            handleClientDisconnect()
        }
    }

    /**
     * Check if the server is running.
     */
    fun isRunning(): Boolean = isRunningFlag.get()

    /**
     * Check if a client is connected.
     */
    fun isClientConnected(): Boolean = isClientConnectedFlag.get()

    /**
     * Get the port the server is listening on.
     */
    fun getPort(): Int = port

    private suspend fun acceptConnections() = withContext(Dispatchers.IO) {
        while (isRunningFlag.get()) {
            try {
                val server = serverSocket ?: break
                Log.d(TAG, "Waiting for client connection on port $port...")

                val socket = server.accept()
                handleNewConnection(socket)
            } catch (e: SocketException) {
                // Server socket was closed
                if (isRunningFlag.get()) {
                    Log.e(TAG, "Socket error: ${e.message}")
                }
                break
            } catch (e: Exception) {
                Log.e(TAG, "Error accepting connection: ${e.message}")
                onError?.invoke("Connection error: ${e.message}")
            }
        }
    }

    private suspend fun handleNewConnection(socket: Socket) {
        // Disconnect previous client if any
        disconnectClient()

        try {
            clientSocket = socket
            socket.tcpNoDelay = true // Disable Nagle's algorithm for low latency

            outputStream = DataOutputStream(BufferedOutputStream(socket.getOutputStream()))
            inputStream = DataInputStream(BufferedInputStream(socket.getInputStream()))

            isClientConnectedFlag.set(true)
            Log.i(TAG, "Client connected from ${socket.inetAddress.hostAddress}")

            onClientConnected?.invoke()

            // Flush any queued messages
            flushMessageQueue()

            // Start reading messages
            readMessages()
        } catch (e: Exception) {
            Log.e(TAG, "Error handling connection: ${e.message}")
            handleClientDisconnect()
        }
    }

    private fun flushMessageQueue() {
        while (messageQueue.isNotEmpty() && isClientConnectedFlag.get()) {
            val message = messageQueue.poll() ?: break
            try {
                val output = outputStream ?: break
                val bytes = message.toByteArray(StandardCharsets.UTF_8)
                output.writeInt(bytes.size)
                output.write(bytes)
                output.flush()
            } catch (e: Exception) {
                // Re-queue the message and break
                messageQueue.add(message)
                break
            }
        }
    }

    private suspend fun readMessages() = withContext(Dispatchers.IO) {
        while (isClientConnectedFlag.get()) {
            try {
                val input = inputStream ?: break

                // Read length-prefixed message
                val length = input.readInt()

                if (length <= 0 || length > MAX_MESSAGE_SIZE) {
                    Log.w(TAG, "Invalid message length: $length")
                    continue
                }

                val bytes = ByteArray(length)
                input.readFully(bytes)

                val message = String(bytes, StandardCharsets.UTF_8)

                // Dispatch message to JS
                withContext(Dispatchers.Main) {
                    onMessageReceived?.invoke(message)
                }
            } catch (e: EOFException) {
                Log.d(TAG, "Client disconnected (EOF)")
                break
            } catch (e: SocketException) {
                Log.d(TAG, "Client disconnected (socket closed)")
                break
            } catch (e: Exception) {
                Log.e(TAG, "Error reading message: ${e.message}")
                break
            }
        }

        handleClientDisconnect()
    }

    private fun handleClientDisconnect() {
        if (!isClientConnectedFlag.getAndSet(false)) {
            return // Already disconnected
        }

        Log.i(TAG, "Client disconnected")
        onClientDisconnected?.invoke()

        try {
            outputStream?.close()
            inputStream?.close()
            clientSocket?.close()
        } catch (e: Exception) {
            Log.e(TAG, "Error closing client resources: ${e.message}")
        }

        outputStream = null
        inputStream = null
        clientSocket = null
    }

    private fun disconnectClient() {
        handleClientDisconnect()
    }
}
