#include <QtTest>
#include <QTemporaryDir>
#include <QFile>
#include <QDir>
#include <QQmlApplicationEngine>
#include <QQmlContext>
#include <QQuickWindow>
#include <QQuickStyle>
#include "backend.h"
#include "theme.h"
#include "translator.h"

class MorningSignalTests : public QObject {
    Q_OBJECT
private:
    static bool write(const QString &path, const QByteArray &data, bool executable = false) {
        QFile file(path);
        if (!file.open(QIODevice::WriteOnly) || file.write(data) != data.size()) return false;
        file.close();
        return !executable || file.setPermissions(QFile::ReadOwner | QFile::WriteOwner | QFile::ExeOwner);
    }
private slots:
    void fixedProductionTargets() {
        QCOMPARE(Backend::arguments("open"), QStringList{"--app=https://bartconsedine.com/admin/apps/morning-feed"});
        QCOMPARE(Backend::arguments("display"), QStringList{"--app=https://bartconsedine.com/admin/apps/morning-feed?view=home"});
        QCOMPARE(Backend::arguments("browser"), QStringList{"https://bartconsedine.com/admin/apps/morning-feed"});
        QVERIFY(Backend::arguments("https://example.com").isEmpty());
        QVERIFY(Backend::arguments("--no-sandbox").isEmpty());
    }
    void browserDiscovery() {
        QTemporaryDir dir;
        QVERIFY(Backend::findBrowser({dir.path()}).isEmpty());
        QVERIFY(write(dir.filePath("chromium"), "#!/bin/sh\nexit 0\n", true));
        QCOMPARE(Backend::findBrowser({dir.path()}), dir.filePath("chromium"));
        QVERIFY(write(dir.filePath("google-chrome-stable"), "#!/bin/sh\nexit 0\n", true));
        QCOMPARE(Backend::findBrowser({dir.path()}), dir.filePath("google-chrome-stable"));
    }
    void launchPassesOnlyExpectedArguments() {
        QTemporaryDir dir;
        const auto script = dir.filePath("browser");
        const auto output = dir.filePath("arguments");
        QVERIFY(write(script, "#!/bin/sh\nprintf '%s\\n' \"$@\" > \"" + output.toUtf8() + "\"\n", true));
        Backend backend;
        QVERIFY(backend.launch("display", script));
        QTRY_VERIFY(QFile::exists(output));
        QFile file(output);
        QVERIFY(file.open(QIODevice::ReadOnly));
        QTRY_COMPARE(file.size(), qint64(Backend::arguments("display").first().toUtf8().size() + 1));
        QCOMPARE(file.readAll(), Backend::arguments("display").first().toUtf8() + '\n');
        QVERIFY(backend.error().isEmpty());
    }
    void failedLaunchReportsError() {
        Backend backend;
        QVERIFY(!backend.launch("open", {}));
        QVERIFY(!backend.error().isEmpty());
        QVERIFY(!backend.launch("open", "/missing/morning-signal-browser"));
        QVERIFY(!backend.error().isEmpty());
        QVERIFY(!backend.launch("invalid", "/usr/bin/true"));
        QVERIFY(!backend.error().isEmpty());
    }
    void themeAndTranslation() {
        QTemporaryDir dir;
        Theme theme(dir.path());
        QCOMPARE(theme.accent(), QString("#FFD60A"));
        QVERIFY(write(dir.filePath("language"), "da\n"));
        Translator translator(dir.filePath("language"));
        QCOMPARE(translator.language(), QString("da"));
        QCOMPARE(translator.translate("Main", "Retry"), QString::fromUtf8("Prøv igen"));
        QVERIFY(translator.translate("Main", "Untranslated").isNull());
        QVERIFY(write(dir.filePath("language"), "en\n"));
        QTRY_COMPARE(translator.language(), QString("en"));
    }
    void failureWindowLoadsAndRenders() {
        QQuickStyle::setStyle("Material");
        QTemporaryDir dir;
        Theme theme(dir.path());
        Translator translator(dir.filePath("language"));
        Backend backend;
        QVERIFY(!backend.launch("open", {}));
        QQmlApplicationEngine engine;
        engine.rootContext()->setContextProperty("theme", &theme);
        engine.rootContext()->setContextProperty("translator", &translator);
        engine.rootContext()->setContextProperty("backend", &backend);
        engine.load(QUrl("qrc:/Main.qml"));
        QCOMPARE(engine.rootObjects().size(), 1);
        auto window = qobject_cast<QQuickWindow *>(engine.rootObjects().first());
        QVERIFY(window);
        QTest::qWait(150);
        QVERIFY(window->isVisible());
        QCOMPARE(window->property("helpVisible").toBool(), false);
        QTest::keyClick(window, Qt::Key_Question);
        QTRY_COMPARE(window->property("helpVisible").toBool(), true);
        QTest::keyClick(window, Qt::Key_Question);
        QTRY_COMPARE(window->property("helpVisible").toBool(), false);
        // Optional evidence is written outside the source tree by the test runner.
        const auto screenshot = qEnvironmentVariable("MORNING_SIGNAL_TEST_SCREENSHOT");
        if (!screenshot.isEmpty()) QVERIFY(window->grabWindow().save(screenshot));
    }
};
QTEST_MAIN(MorningSignalTests)
#include "morning-signal_tests.moc"
