// App entry point. The background route-recording task must be registered
// before anything else, because Android may start the JS bundle with no
// screens at all just to deliver GPS fixes to it.
import './src/tracking/recorder';
import 'expo-router/entry';
