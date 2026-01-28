import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { ActionButton, ResultDisplay, ConnectionStatus } from '@/components';
import { apiHelpers } from '@/utils/api';

export default function NetworkScreen() {
  const [results, setResults] = useState<string[]>([]);
  const [loading, setLoading] = useState<string | null>(null);

  const addResult = (message: string) => {
    setResults((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`]);
  };

  const handleFetchGet = async () => {
    setLoading('fetch-get');
    try {
      const response = await fetch('https://jsonplaceholder.typicode.com/posts/1');
      const data = await response.json();
      addResult(`Fetch GET: Received post "${data.title.substring(0, 30)}..."`);
    } catch (error) {
      addResult(`Fetch GET failed: ${error}`);
    } finally {
      setLoading(null);
    }
  };

  const handleFetchPost = async () => {
    setLoading('fetch-post');
    try {
      const response = await fetch('https://jsonplaceholder.typicode.com/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Test Post',
          body: 'This is a test post from the debugger example app',
          userId: 1,
        }),
      });
      const data = await response.json();
      addResult(`Fetch POST: Created post with id ${data.id}`);
    } catch (error) {
      addResult(`Fetch POST failed: ${error}`);
    } finally {
      setLoading(null);
    }
  };

  const handleAxiosGet = async () => {
    setLoading('axios-get');
    try {
      const response = await apiHelpers.getPosts();
      addResult(`Axios GET: Received ${response.data.length} posts`);
    } catch (error) {
      addResult(`Axios GET failed: ${error}`);
    } finally {
      setLoading(null);
    }
  };

  const handleAxiosPost = async () => {
    setLoading('axios-post');
    try {
      const response = await apiHelpers.createPost({
        title: 'New Post via Axios',
        body: 'Created using axios with interceptor',
        userId: 1,
      });
      addResult(`Axios POST: Created post with id ${response.data.id}`);
    } catch (error) {
      addResult(`Axios POST failed: ${error}`);
    } finally {
      setLoading(null);
    }
  };

  const handleAxiosUpdate = async () => {
    setLoading('axios-update');
    try {
      const response = await apiHelpers.updatePost(1, { title: 'Updated Title' });
      addResult(`Axios PATCH: Updated post title to "${response.data.title}"`);
    } catch (error) {
      addResult(`Axios PATCH failed: ${error}`);
    } finally {
      setLoading(null);
    }
  };

  const handleAxiosDelete = async () => {
    setLoading('axios-delete');
    try {
      await apiHelpers.deletePost(1);
      addResult('Axios DELETE: Deleted post 1');
    } catch (error) {
      addResult(`Axios DELETE failed: ${error}`);
    } finally {
      setLoading(null);
    }
  };

  const handleNetworkError = async () => {
    setLoading('error');
    try {
      await apiHelpers.triggerError();
    } catch (error: any) {
      addResult(`Network error triggered: ${error.response?.status || error.message}`);
    } finally {
      setLoading(null);
    }
  };

  const handleMultipleRequests = async () => {
    setLoading('multiple');
    try {
      const [posts, users] = await Promise.all([apiHelpers.getPosts(), apiHelpers.getUsers()]);
      addResult(`Parallel requests: ${posts.data.length} posts, ${users.data.length} users`);
    } catch (error) {
      addResult(`Parallel requests failed: ${error}`);
    } finally {
      setLoading(null);
    }
  };

  const clearResults = () => setResults([]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <ConnectionStatus />

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Fetch API</Text>
        <Text style={styles.sectionDescription}>
          Native fetch requests are automatically intercepted.
        </Text>

        <ActionButton
          title="GET Request"
          onPress={handleFetchGet}
          icon="download"
          loading={loading === 'fetch-get'}
        />
        <ActionButton
          title="POST Request"
          onPress={handleFetchPost}
          icon="push"
          variant="secondary"
          loading={loading === 'fetch-post'}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Axios</Text>
        <Text style={styles.sectionDescription}>
          Axios instance with interceptAxios() for detailed tracking.
        </Text>

        <ActionButton
          title="GET Posts"
          onPress={handleAxiosGet}
          icon="document-text"
          loading={loading === 'axios-get'}
        />
        <ActionButton
          title="POST Create"
          onPress={handleAxiosPost}
          icon="add-circle"
          variant="secondary"
          loading={loading === 'axios-post'}
        />
        <ActionButton
          title="PATCH Update"
          onPress={handleAxiosUpdate}
          icon="create"
          variant="secondary"
          loading={loading === 'axios-update'}
        />
        <ActionButton
          title="DELETE"
          onPress={handleAxiosDelete}
          icon="trash"
          variant="danger"
          loading={loading === 'axios-delete'}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Advanced</Text>

        <ActionButton
          title="Trigger 404 Error"
          onPress={handleNetworkError}
          icon="alert-circle"
          variant="danger"
          loading={loading === 'error'}
        />
        <ActionButton
          title="Parallel Requests"
          onPress={handleMultipleRequests}
          icon="git-merge"
          variant="secondary"
          loading={loading === 'multiple'}
        />
      </View>

      <ResultDisplay title="Request History" results={results} />

      {results.length > 0 && (
        <ActionButton title="Clear History" onPress={clearResults} variant="secondary" icon="trash" />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f1a',
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#f9fafb',
    marginBottom: 6,
  },
  sectionDescription: {
    fontSize: 14,
    color: '#9ca3af',
    marginBottom: 16,
    lineHeight: 20,
  },
});
