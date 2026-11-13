#pragma once

#include <QObject>
#include <QStringList>

class Backend : public QObject {
    Q_OBJECT
    Q_PROPERTY(QString error READ error NOTIFY changed)
public:
    explicit Backend(QObject *parent = nullptr) : QObject(parent) {}
    QString error() const { return m_error; }
    static QString findBrowser(const QStringList &paths = {});
    static QStringList arguments(const QString &mode);
    bool launch(const QString &mode, const QString &browser);
    Q_INVOKABLE bool retry();
signals:
    void changed();
private:
    QString m_error;
    QString m_mode = "open";
};
