QT += core gui qml quick quickcontrols2 testlib
CONFIG += c++17 testcase
TARGET = morning-signal_tests
TEMPLATE = app
INCLUDEPATH += ../src
HEADERS += ../src/backend.h ../src/theme.h ../src/translator.h
SOURCES += morning-signal_tests.cpp ../src/backend.cpp ../src/theme.cpp ../src/translator.cpp
RESOURCES += ../src/resources.qrc
