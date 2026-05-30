<p align="center">
 <img src="./readme/1.png" width="450">
 <img src="./readme/2.png" width="450">
 <img src="./readme/3.png" width="450">
 <img src="./readme/4.png" width="450">
</p>

<<<<<<< Updated upstream
This little app is dedicated for HTPC/handheld users that have remote FTP with roms (tested on bazzite, works great with ES-DE folder structure).
=======
This little app is dedicated for HTPC/handheld users that have remote ROM servers.

> > > > > > > Stashed changes

Features:

1. Connect to FTP, FTPS, or SFTP share (your own or friend's ;))
2. Browse it using gamepad (built with keyboardless setups in mind)
3. Search and view ROMs libraries with covers (you'll need twitch dev account for that)
4. Download/delete single or multiple ROM files at once
5. Don't want to type the config? You can provide config file like this:

```
{
  "ROMS_DIRECTORY": "C:\\Roms",
  "FTP_PROTOCOL": "sftp",
  "FTP_HOSTNAME": "example.com",
  "FTP_PORT": "22",
  "FTP_PATH": "/roms",
  "FTP_USERNAME": "myuser",
  "FTP_PASSWORD": "mypassword",
  "TWITCH_CLIENT_ID": "your-twitch-client-id",
  "TWITCH_CLIENT_SECRET": "your-twitch-client-secret"
}
```

`FTP_PROTOCOL` is optional. Supported values: `ftp`, `ftps`, `sftp`.
