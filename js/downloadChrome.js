/*global window, FileError,alert,document, DEBUG, clearit */
"use strict";

var testSize = 1024 * 1024 * 1024 * 25
function FileSystemAPI(dl_id, dl) {
	var dl_quotabytes = 0
		, IO = this
		, Fs
		, dl_fw
		, dirid = "mega"
		, dl_chunks = []
		, dl_chunksizes = []
		, dl_writing
		, dl_ack_write = function() {}
		, chrome_write_error_msg = 20
		, targetpos = 0
		, dl_geturl
		, dl_filesize
		, dl_req_storage
		, dl_filename
		, zfileEntry
		, failed = false
		, dl_storagetype = 0
		;

	window.requestFileSystem = window.webkitRequestFileSystem;

	// errorHandler {{{
	function errorHandler(type) {
		return function (e) {
		  switch (e.code) {
			case FileError.QUOTA_EXCEEDED_ERR:
			  alert('Error writing file, is your harddrive almost full? (' + type + ')');
			  break;
			case FileError.NOT_FOUND_ERR:
			  alert('NOT_FOUND_ERR in ' + type);
			  break;
			case FileError.SECURITY_ERR:
			  alert('File transfers do not work with Chrome Incognito.<br>' + '(Security Error in ' + type + ')');
			  break;
			case FileError.INVALID_MODIFICATION_ERR:
			  alert('INVALID_MODIFICATION_ERR in ' + type);
			  break;
			case FileError.INVALID_STATE_ERR:
				console.log('INVALID_STATE_ERROR in ' + type + ', retrying...');
				setTimeout(function() {
					FileSystemAPI.check();
				}, 500);
				break;
			default:
			  alert('webkitRequestFileSystem failed in ' + type);
		  }
		};	
	}
	// }}}

	// dl_createtmpfile  {{{
	function dl_createtmpfile(fs) {
		Fs = fs;
		Fs.root.getDirectory('mega', {create: true}, function(dirEntry) {                
			DEBUG('Directory "mega" created');
			DEBUG("Opening file for writing: " + dl_id);

			if(is_chrome_firefox) {
				var q = {};
				for(var o in dl_queue) {
					if(dl_queue[o].dl_id == dl_id) {
						q = dl_queue[o];
						break;
					}
				}
				options._firefox = {
					filesize : dl_filesize,
					filename : dl_filename,
					zip      : !1, // XXX
					path     : q.p,
					mtime    : q.t
				};
			}
		
			fs.root.getFile('mega/' + dl_id, {create: true}, function(fileEntry) {
				fileEntry.createWriter(function(fileWriter) {     
					DEBUG('File "mega/' + dl_id + '" created');
					dl_fw = fileWriter
					dl_fw.truncate(0);
	
					dl_fw.onerror = function(e) {
						failed = e;
						dl_ack_write();
					}
	
					dl_fw.onwriteend = function() {
						if (this.position == targetpos) return dl_ack_write();
	
						/* error */
						clearit(0,0,function(s) {
							// clear persistent files:
							clearit(1,0,function(s) {
								if (chrome_write_error_msg == 21 && !$.msgDialog) {
									chrome_write_error_msg=0;
									msgDialog('warningb','Out of disk space','Your system volume is running out of disk space. Your download will continue automatically after you free up some space.');
								}
								chrome_write_error_msg++;
							});
						});
	
						setTimeout(function() {
							failed = 'Short write (' + this.position + ' / ' + this.targetpos + ')';
							dl_ack_write();
						}, 2000);
					}
	
					zfileEntry = fileEntry;
					setTimeout(function() {
						// deferred execution
						IO.begin();
					});
				}, errorHandler('createWriter'));
			}, errorHandler('getFile'));
		}, errorHandler('getDirectory'));

	}
	// }}}

	function dl_getspace(reqsize, next) {
		DEBUG("reqsize", reqsize);

		function retry() {
			dl_getspace(reqsize, next);
		}

		navigator.webkitPersistentStorage.queryUsageAndQuota(function(used, remaining)  {
			navigator.webkitTemporaryStorage.queryUsageAndQuota(function(tused,tremaining) {				
				if (used > 0 || remaining > 0) {
					dl_storagetype = 1
					if (remaining < reqsize) {
						clearit(1, 300, function() {
							retry();
						});
					} else {
						next(true);
					}
				} else {
					// check if standard temporary quota is sufficient to proceed:
					dl_storagetype = 0
					if (tremaining > reqsize) {
						next(true);
					} else if (tused+tremaining > reqsize) {
						clearit(0,300,function() {
							retry();
						});
					} else {
						// ran out of 20% of 50% of free diskspace -> request persistent storage to be able to use all remaining disk space:
						navigator.webkitPersistentStorage.requestQuota(1024*1024*1024*100, function(grantedBytes) {
							if (grantedBytes == 0) return retry();

							dl_storagetype = 1;
							window.webkitRequestFileSystem(PERSISTENT, grantedBytes, function(fs) {
								next(true);
							}, retry);
						}, retry);
					}	
				}
			});
		}, next);
	}

	// Check if the file can be written, return true
	// or fail otherwise
	function check() {
		dl_getspace(dl.size, function() {
			window.requestFileSystem(
				dl_storagetype,
				dl.size,
				dl_createtmpfile,
				errorHandler('RequestFileSystem')
			);
		});
	}

	IO.write = function(buffer, position, done) {
		if (dl_writing || position !== dl_fw.position) {
			// busy or not there yet
			// DEBUG(dl_writing ? "Writer is busy, I'll retry in a bit" : "Queueing future chunk");
			return setTimeout(function() {
				IO.write(buffer, position, done);
			}, 100);
		}
		dl_writing = true;
		failed     = false;
		targetpos  = buffer.length + dl_fw.position;

		dl_ack_write = function() {
			dl_writing = false;
			if (failed) {
				failed = false; /* reset error flag */
				this.seek(position);
				dl_fw.write(new Blob([buffer]));
				return;
			}
			done(); /* notify writer */
		};

		DEBUG("Write " + buffer.length + " bytes at " + position  + "/"  + dl_fw.position);
		dl_fw.write(new Blob([buffer]));
	};

	IO.download = function(name, path) {
		document.getElementById('dllink').download = name;
		document.getElementById('dllink').href = zfileEntry.toURL();
		if (!is_chrome_firefox)  {
			document.getElementById('dllink').click();
		}
	}

	IO.setCredentials = function(url, size, filename, chunks, sizes) {
		dl_geturl = url;
		dl_filesize = size;
		dl_filename = filename;
		dl_chunks   = chunks;
		dl_chunksizes = sizes;
		check();
	};
}

window.requestFileSystem = window.webkitRequestFileSystem;

FileSystemAPI.init = function dl_getspace(storagetype, minsize) {
	storagetype = storagetype || 0;
	minsize = minsize || 0;
	
	/**
	 * XXX Chrome warning: 'window.webkitStorageInfo' is deprecated.
	 * Please use 'navigator.webkitTemporaryStorage' or 'navigator.webkitPersistentStorage' instead. 
	 */
	var StorageInfo = window.webkitStorageInfo;

	StorageInfo.queryUsageAndQuota(1, function (used, remaining) {
		if (remaining > 0) {
			dl_quotabytes = remaining;
			FileSystemAPI.storagetype = 1;
			if (dl_quotabytes < 1073741824) {
				clearit(1, 3600);
			} else {
				clearit(1);
			}
		} else {
			var requestbytes = testSize * 4;
			switch (storagetype) {
			case 0:
				requestbytes = testSize;
				break;
			case 1:
				dl_req_storage = true;
				break;
			}

			StorageInfo.requestQuota(storagetype, requestbytes, function (grantedBytes)
			{
				StorageInfo.queryUsageAndQuota(storagetype, function (used, remaining)
				{
					if (storagetype === 1) {
						dl_req_storage = false;
					}

					dl_quotabytes = remaining;

					if (dl_quotabytes < 1073741824) {
						clearit(storagetype, 3600);
					}

					if ((remaining == 0) && (storagetype == 1)) {
						if (!dl_req_storage) {
							dl_getspace(1, minsize);
						}
						return false;
					} else if ((minsize > dl_quotabytes) && (storagetype == 0)) {
						if (!dl_req_storage) {
							dl_getspace(1, minsize)
						}
						return false;
					} else if ((minsize > dl_quotabytes) && (storagetype == 1)) {
						clearit(storagetype, 3600);
					}

					FileSystemAPI.storagetype = remaining > 0 && storagetype || 0;
					FileSystemAPI.init = undefined; // no longer needed

				}, dlError('error: could not query usage and storage quota. (FSFileSystem)'));
			}, dlError('ERROR: Could not grant storage space (FSFileSystem)'));
		}
	}, dlError('ERROR: Could not query usage and storage quota.'));
};
