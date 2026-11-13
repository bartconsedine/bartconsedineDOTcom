#include <QGuiApplication>
#include <QCoreApplication>
#include <QIcon>
#include <QJsonDocument>
#include <QJsonObject>
#include <QQmlApplicationEngine>
#include <QQmlContext>
#include <QQuickStyle>
#include <QTextStream>
#include "backend.h"
#include "theme.h"
#include "translator.h"

int main(int argc, char *argv[]) {
    // Help and diagnostics never require a display or open a browser.
    bool headless = false;
    for (int i = 1; i < argc; ++i)
        if (QString(argv[i]) == "check" || QString(argv[i]) == "--help" || QString(argv[i]) == "--version") headless = true;
    if (headless) {
        qputenv("QT_QPA_PLATFORM", "offscreen");
        qputenv("QT_QPA_PLATFORMTHEME", "");
    }
    QGuiApplication app(argc, argv);
    app.setApplicationName("morning-signal");
    app.setApplicationVersion("0.1.0");
    app.setDesktopFileName("morning-signal");
    app.setWindowIcon(QIcon(":/icon.svg"));
    QStringList args = app.arguments().mid(1);
    if (args == QStringList{"--help"}) {
        QTextStream(stdout) << "Usage: morning-signal [open|display|browser|check [--json]]\n"
            "open     Open the live editor in a dedicated desktop window (default).\n"
            "display  Open the live full-window Home/News/Briefing interface.\n"
            "browser  Open the live editor in a regular browser tab for sign-in.\n"
            "check    Report browser availability; does not test login or database access.\n";
        return 0;
    }
    if (args == QStringList{"--version"}) { QTextStream(stdout) << app.applicationVersion() << '\n'; return 0; }
    const QString mode = args.isEmpty() ? "open" : args.first();
    if ((mode != "check" && (args.size() > 1 || Backend::arguments(mode).isEmpty())) ||
        (mode == "check" && args != QStringList{"check"} && args != QStringList{"check", "--json"})) {
        QTextStream(stderr) << "Invalid arguments. Use morning-signal --help.\n";
        return 1;
    }
    const auto browser = Backend::findBrowser();
    if (mode == "check") {
        if (args.contains("--json"))
            QTextStream(stdout) << QJsonDocument(QJsonObject{{"ok", !browser.isEmpty()}, {"browser", browser},
                {"url", "https://bartconsedine.com/admin/apps/morning-feed"}, {"authenticatedSessionVerified", false}}).toJson(QJsonDocument::Compact) << '\n';
        else QTextStream(stdout) << (browser.isEmpty() ? "No supported browser found." : browser) << '\n';
        if (browser.isEmpty()) QTextStream(stderr) << "Chrome or Chromium is required.\n";
        return browser.isEmpty() ? 1 : 0;
    }
    Translator translator;
    app.installTranslator(&translator);
    Backend backend;
    // Chrome owns the authenticated web surface, including save/discard prompts.
    // The native process exits after handoff, so it has no idle polling cost.
    if (backend.launch(mode, browser)) return 0;
    QTextStream(stderr) << backend.error() << '\n';
    QQuickStyle::setStyle("Material");
    Theme theme;
    QQmlApplicationEngine engine;
    QObject::connect(&translator, &Translator::changed, &engine, &QQmlEngine::retranslate);
    engine.rootContext()->setContextProperty("theme", &theme);
    engine.rootContext()->setContextProperty("translator", &translator);
    engine.rootContext()->setContextProperty("backend", &backend);
    engine.load(QUrl("qrc:/Main.qml"));
    if (engine.rootObjects().isEmpty()) return 1;
    return app.exec();
}
