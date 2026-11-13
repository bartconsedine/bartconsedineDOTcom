import QtQuick
import QtQuick.Controls
import QtQuick.Controls.Material
import QtQuick.Layouts

ApplicationWindow {
    id: win
    width: 560; height: 360
    minimumWidth: 360; minimumHeight: 300
    visible: true
    title: qsTr("Morning signal")
    color: "#0e0e10"
    Material.theme: Material.Dark
    Material.accent: theme.accent
    Material.roundedScale: theme.radius
    property bool helpVisible: false
    Shortcut { sequence: "?"; context: Qt.ApplicationShortcut; onActivated: win.helpVisible = !win.helpVisible }
    Shortcut { sequence: "Q"; context: Qt.ApplicationShortcut; onActivated: Qt.quit() }
    Shortcut { sequence: "Space"; context: Qt.ApplicationShortcut; onActivated: { if (backend.retry()) Qt.quit() } }
    Item {
        anchors.fill: parent
        LayoutMirroring.enabled: Qt.application.layoutDirection === Qt.RightToLeft
        LayoutMirroring.childrenInherit: true
        ColumnLayout {
            anchors.fill: parent; anchors.margins: 28; spacing: 16
            Label { text: qsTr("Morning signal"); font.pixelSize: 28; color: theme.accent }
            Label { text: backend.error; wrapMode: Text.WordWrap; Layout.fillWidth: true }
            Label { text: qsTr("Your saved briefing remains on the website. Retry after fixing the browser installation."); wrapMode: Text.WordWrap; Layout.fillWidth: true }
            Item { Layout.fillHeight: true }
            Label { visible: win.helpVisible; text: qsTr("Space: retry · Q: quit · ?: shortcuts"); wrapMode: Text.WordWrap; Layout.fillWidth: true }
            RowLayout {
                Button { text: qsTr("Retry"); onClicked: { if (backend.retry()) Qt.quit() } }
                Button { text: qsTr("Close"); onClicked: Qt.quit() }
            }
        }
    }
}
