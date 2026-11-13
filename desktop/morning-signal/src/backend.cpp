#include "backend.h"
#include <QProcess>
#include <QStandardPaths>

QString Backend::findBrowser(const QStringList &paths) {
    for (const auto &name : {"google-chrome-stable", "google-chrome", "chromium"}) {
        const auto executable = QStandardPaths::findExecutable(name, paths);
        if (!executable.isEmpty()) return executable;
    }
    return {};
}

QStringList Backend::arguments(const QString &mode) {
    const QString url = "https://bartconsedine.com/admin/apps/morning-feed";
    if (mode == "browser") return {url};
    if (mode == "display") return {"--app=" + url + "?view=home"};
    if (mode == "open") return {"--app=" + url};
    return {};
}

bool Backend::launch(const QString &mode, const QString &browser) {
    m_mode = mode;
    const auto args = arguments(mode);
    if (args.isEmpty()) m_error = tr("Unknown launch mode.");
    else if (browser.isEmpty()) m_error = tr("Chrome or Chromium is required. Install a supported browser, then retry.");
    else if (!QProcess::startDetached(browser, args)) m_error = tr("The browser could not start. Check its installation, then retry.");
    else { m_error.clear(); emit changed(); return true; }
    emit changed();
    return false;
}

bool Backend::retry() { return launch(m_mode, findBrowser()); }
