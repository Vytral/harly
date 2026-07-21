# Embedding in Mobile Apps

DocuSeal has no native mobile SDK. Host `<docuseal-form>` inside a WebView.

| Platform | WebView library |
|---|---|
| Android | `android.webkit.WebView` |
| iOS | `WKWebView` |
| React Native | `react-native-webview` |
| Flutter | `webview_flutter` |

Attribute reference (all `data-*`): see [signing-form-js.md](signing-form-js.md).

## Android

```kotlin
import android.annotation.SuppressLint
import android.os.Bundle
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import androidx.appcompat.app.AppCompatActivity

class WebViewActivity : AppCompatActivity() {

  private lateinit var webView: WebView

  @SuppressLint("SetJavaScriptEnabled")
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    setContentView(R.layout.activity_webview) // Replace with your layout file

    webView = findViewById(R.id.webView) // Replace with your WebView ID

    val webSettings: WebSettings = webView.settings
    webSettings.javaScriptEnabled = true // Enable JavaScript for the WebView

    // Load the HTML content into the WebView
    val htmlContent = """
      <html>
      <head>
        <script src="https://cdn.docuseal.com/js/form.js"></script>
      </head>
      <body>
        <docuseal-form
          data-src="https://docuseal.com/d/LEVGR9rhZYf86M"
          data-email="signer@example.com">
        </docuseal-form>
      </body>
      </html>
    """.trimIndent()

    webView.webChromeClient = WebChromeClient() // Optional, for better web experience
    webView.loadDataWithBaseURL(null, htmlContent, "text/html", "UTF-8", null)
  }
}
```

## iOS

```swift
import UIKit
import WebKit

class ViewController: UIViewController, WKNavigationDelegate {

  var webView: WKWebView!

  override func viewDidLoad() {
    super.viewDidLoad()

    // Create a WKWebView
    webView = WKWebView(frame: view.bounds)
    webView.navigationDelegate = self
    view.addSubview(webView)

    // Load HTML content
    let htmlString = """
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <script src="https://cdn.docuseal.com/js/form.js"></script>
      </head>
      <body>
        <docuseal-form
          data-src="https://docuseal.com/d/LEVGR9rhZYf86M"
          data-email="signer@example.com">
        </docuseal-form>
      </body>
    </html>
    """

    webView.loadHTMLString(htmlString, baseURL: nil)
  }

  // WKNavigationDelegate method to handle page load completion or errors
  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
    print("Page loaded successfully")
  }

  func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
    print("Failed to load page: (error.localizedDescription)")
  }
}
```

## React Native

```jsx
import { WebView } from 'react-native-webview';

export default function SignForm() {
  return (
    <WebView
      source={{ html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <script src="https://cdn.docuseal.com/js/form.js"></script>
          </head>
          <body>
            <docuseal-form
              style="height: 100vh"
              data-src="https://docuseal.com/d/LEVGR9rhZYf86M"
              data-email="signer@example.com"
            > Loading...
            </docuseal-form>
          </body>
        </html>
      ` }}
    />
  );
}
```

## Flutter

```dart
import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';

void main() {
  runApp(const DocuSealDemoApp());
}

class DocuSealDemoApp extends StatelessWidget {
  const DocuSealDemoApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'DocuSeal Demo',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: Colors.blue),
        useMaterial3: true,
      ),
      home: const WebviewPage(),
    );
  }
}

class WebviewPage extends StatefulWidget {
  const WebviewPage({Key? key}) : super(key: key);

  @override
  State<WebviewPage> createState() => _WebviewPageState();
}

class _WebviewPageState extends State<WebviewPage> {
  WebViewController? _controller;

  @override
  void initState() {
    String html = '''
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <script src="https://cdn.docuseal.com/js/form.js"></script>
        </head>
        <body>
          <docuseal-form
            id="docusealForm"
            data-src="https://docuseal.com/d/LEVGR9rhZYf86M"
            data-email="signer@example.com">
          </docuseal-form>
        </body>
      </html>
      ''';

    super.initState();
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(const Color(0x00000000))
      ..setNavigationDelegate(
        NavigationDelegate(
          onNavigationRequest: (NavigationRequest request) {
            return NavigationDecision.navigate;
          },
        ),
      )
      ..loadHtmlString(html);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
        appBar: AppBar(
          title: const Text("DocuSeal Demo"),
          actions: const [],
        ),
        body: WebViewWidget(controller: _controller!));
  }
}
```

## Example repositories

- Android: https://github.com/docusealco/docuseal-android-example
- iOS: https://github.com/docusealco/docuseal-ios-example
- React Native: https://github.com/docusealco/docuseal-react-native
- Flutter: https://github.com/docusealco/docuseal-flutter-example
