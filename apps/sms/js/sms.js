/* -*- Mode: js; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- /
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

var MessageManager = {
  init: function mm_init() {
    this.initialized = true;
    // Init PhoneNumberManager for solving country code issue.
    PhoneNumberManager.init();

    MessageManager.getMessages(ThreadListUI.renderThreads);
    // Init UI Managers
    ThreadUI.init();
    ThreadListUI.init();
    if (navigator.mozSms) {
      navigator.mozSms.addEventListener('received',
          this.onMessageReceived.bind(this));
      navigator.mozSms.addEventListener('sending', this.onMessageSending);
      navigator.mozSms.addEventListener('sent', this.onMessageSent);
      navigator.mozSms.addEventListener('failed', this.onMessageFailed);
    }
    window.addEventListener('hashchange', this.onHashChange.bind(this));
    document.addEventListener('mozvisibilitychange',
        this.onVisibilityChange.bind(this));
  },

  onMessageSending: function mm_onMessageSending(e) {
    var message = e.message;
    ThreadUI.appendMessage(message);
    MessageManager.getMessages(ThreadListUI.renderThreads);
  },

  onMessageFailed: function mm_onMessageFailed(e) {
    ThreadUI.onMessageFailed(e.message);
  },

  onMessageSent: function mm_onMessageSent(e) {
    ThreadUI.onMessageSent(e.message);
  },

  onMessageReceived: function mm_onMessageReceived(e) {
    if (window.location.hash === '#edit') {
      return;
    }

    var message = e.message;

    var num;
    if (this.currentNum) {
      num = this.currentNum;
    }

    var sender = message.sender;
    if (num && num === sender) {
      //Append message and mark as unread
      this.markMessagesRead([message.id], true, function() {
        MessageManager.getMessages(ThreadListUI.renderThreads);
      });
      ThreadUI.appendMessage(message);
      Utils.updateTimeHeaders();
    } else {
      this.getMessages(ThreadListUI.renderThreads);
    }
  },

  slide: function mm_slide(callback) {
    var mainWrapper = document.getElementById('main-wrapper');
    mainWrapper.classList.toggle('to-left');
    mainWrapper.addEventListener('transitionend', function slideTransition() {
      mainWrapper.removeEventListener('transitionend', slideTransition);
      if (callback) {
        callback();
      }
    });
  },

  onHashChange: function mm_onHashChange(e) {
    var mainWrapper = document.getElementById('main-wrapper');
    var threadMessages = document.getElementById('thread-messages');
    switch (window.location.hash) {
      case '#new':
        var messageInput = document.getElementById('message-to-send');
        var receiverInput = document.getElementById('receiver-input');
        //Keep the  visible button the :last-child
        var contactButton = document.getElementById('icon-contact');
        contactButton.parentNode.appendChild(contactButton);
        document.getElementById('messages-container').innerHTML = '';
        messageInput.value = '';
        receiverInput.value = '';
        ThreadUI.sendButton.disabled = true;
        MessageManager.currentNum = null;
        threadMessages.classList.add('new');
        MessageManager.slide(function() {
          receiverInput.focus();
        });
        break;
      case '#thread-list':
        //Keep the  visible button the :last-child
        var editButton = document.getElementById('icon-edit');
        editButton.parentNode.appendChild(editButton);
        MessageManager.currentNum = null;
        if (mainWrapper.classList.contains('edit')) {
          if (ThreadListUI.editDone) {
            ThreadListUI.editDone = false;
            this.getMessages(ThreadListUI.renderThreads);
          }
          mainWrapper.classList.remove('edit');
        } else if (threadMessages.classList.contains('new')) {
          MessageManager.slide(function() {
            threadMessages.classList.remove('new');
          });
        } else {
          MessageManager.slide(function() {
            ThreadUI.view.innerHTML = '';
            if (MessageManager.activityTarget) {
              window.location.hash =
                '#num=' + MessageManager.activityTarget;
              delete MessageManager.activityTarget;
              delete MessageManager.lockActivity;
            }
          });
        }
        break;
      case '#edit':
        ThreadListUI.cleanForm();
        ThreadUI.cleanForm();
        mainWrapper.classList.toggle('edit');
        break;
      default:
        var num = this.getNumFromHash();
        if (num) {
          var filter = this.createFilter(num);
          var messageInput = document.getElementById('message-to-send');
          var numNormalized =
            PhoneNumberManager.getNormalizedInternationalNumber(num);
          MessageManager.currentNum = numNormalized;
          if (mainWrapper.classList.contains('edit')) {
            this.getMessages(ThreadUI.renderMessages, filter);
            mainWrapper.classList.remove('edit');
          } else if (threadMessages.classList.contains('new')) {
            this.getMessages(ThreadUI.renderMessages, filter, true);
            threadMessages.classList.remove('new');
            messageInput.focus();

          } else {
            // As soon as we click in the thread, we visually mark it
            // as read.
            document.getElementById('thread_' + num)
                    .getElementsByTagName('a')[0].classList
                    .remove('unread');
            this.getMessages(ThreadUI.renderMessages,
              filter, true, function() {
                MessageManager.slide(function() {
                  messageInput.focus();
                });
              });
          }
        }
      break;
    }
  },

  onVisibilityChange: function mm_onVisibilityChange(e) {
    if (!document.mozHidden) {
      if (window.location.hash == '#edit') {
        return;
      }
      this.getMessages(ThreadListUI.renderThreads);
      if (!MessageManager.lockActivity) {
        var num = this.currentNum;
        if (num) {
          var filter = this.createFilter(num);
          var typedText = ThreadUI.input.value;
          this.getMessages(ThreadUI.renderMessages, filter, true,
            function() {
              // Restored previous typed text.
              ThreadUI.input.value = typedText;
              ThreadUI.input.focus();
              ThreadUI.enableSend();
          });
        }
      }
    }
  },

  createFilter: function mm_createFilter(num) {
    var filter = new MozSmsFilter();
    if (num) {
      num = PhoneNumberManager.getNormalizedInternationalNumber(num);
    } else {
      num = '';
    }

    filter.numbers = [num];
    return filter;
  },

  getNumFromHash: function mm_getNumFromHash() {
    var num = /\bnum=(.+)(&|$)/.exec(window.location.hash);
    return num ? num[1] : null;
  },
  // Retrieve messages from DB and execute callback
  getMessages: function mm_getMessages(callback, filter, invert, callbackArgs) {
    var request = navigator.mozSms.getMessages(filter, !invert);
    var self = this;
    var messages = [];
    request.onsuccess = function onsuccess() {
      var cursor = request.result;
      if (cursor.message) {
        messages.push(cursor.message);
        cursor.continue();
      } else {
        callback(messages, callbackArgs);
      }
    };

    request.onerror = function onerror() {
      var msg = 'Reading the database. Error: ' + request.errorCode;
      console.log(msg);
    };
  },

  send: function mm_send(number, text, callback, errorHandler) {
    var req = navigator.mozSms.send(number, text);
    req.onsuccess = function onsuccess(e) {
      callback && callback(req.result);
    };

    req.onerror = function onerror(e) {
      errorHandler && errorHandler(number);
    };
  },

  deleteMessage: function mm_deleteMessage(id, callback) {
    var req = navigator.mozSms.delete(id);
    req.onsuccess = function onsuccess() {
      callback && callback(req.result);
    };

    req.onerror = function onerror() {
      var msg = 'Deleting in the database. Error: ' + req.errorCode;
      console.log(msg);
      callback && callback(null);
    };
  },

  /*
    TODO: If the messages could not be deleted completely,
    conversation list page will also update without notification currently.
    May need more infomation for user that the messages were not
    removed completely.
  */
  deleteMessages: function mm_deleteMessages(list, callback) {
    if (list.length > 0) {
      this.deleteMessage(list.shift(), function(result) {
        this.deleteMessages(list, callback);
      }.bind(this));
    } else
      callback();
  },

  markMessagesRead: function mm_markMessagesRead(list, value, callback) {
    if (!navigator.mozSms || !list.length) {
      return;
    }

    // We chain the calls to the API in a way that we make no call to
    // 'markMessageRead' until a previous call is completed. This way any
    // other potential call to the API, like the one for getting a message
    // list, could be done within the calls to mark the messages as read.
    var req = navigator.mozSms.markMessageRead(list.pop(), value);
    req.onsuccess = (function onsuccess() {
      if (!list.length && callback) {
        callback(req.result);
        return;
      }
      this.markMessagesRead(list, value, callback);
    }).bind(this);

    req.onerror = function onerror() {
      if (callback) {
        callback(null);
      }
    };
  }
};

var ThreadListUI = {
  get view() {
    delete this.view;
    return this.view = document.getElementById('thread-list-container');
  },
  get selectAllButton() {
    delete this.selectAllButton;
    return this.selectAllButton = document.getElementById('select-all-threads');
  },
  get deselectAllButton() {
    delete this.deselectAllButton;
    return this.deselectAllButton =
                                document.getElementById('deselect-all-threads');
  },
  get deleteButton() {
    delete this.deleteButton;
    return this.deleteButton = document.getElementById('threads-delete-button');
  },
  get cancelButton() {
    delete this.cancelButton;
    return this.cancelButton = document.getElementById('threads-cancel-button');
  },
  get iconEdit() {
    delete this.iconEdit;
    return this.iconEdit = document.getElementById('icon-edit-threads');
  },
  get pageHeader() {
    delete this.pageHeader;
    return this.pageHeader = document.getElementById('list-edit-title');
  },
  get editForm() {
    delete this.editForm;
    return this.editForm = document.getElementById('threads-edit-form');
  },

  init: function thlui_init() {
    this.delNumList = [];
    this.selectedInputList = [];
    this.selectAllButton.addEventListener('click',
                                          this.selectAllThreads.bind(this));
    this.deselectAllButton.addEventListener('click',
                                            this.deselectAllThreads.bind(this));
    this.deleteButton.addEventListener('click',
                                       this.executeDeletion.bind(this));
    this.cancelButton.addEventListener('click', this.cancelEditMode.bind(this));
    this.view.addEventListener('click', this);
    this.editForm.addEventListener('submit', this);
   },

  updateThreadWithContact:
    function thlui_updateThreadWithContact(number, contacts) {

    var thread = document.getElementById('thread_' + number);
    var nameContainer = thread.getElementsByClassName('name')[0];
    var contact = contacts[0];

    // Update contact phone number
    var contactName = contact.name;
    if (contacts.length > 1) {
      // If there are more than one contact with same phone number
      var others = contacts.length - 1;
      nameContainer.innerHTML = _('others', {
        name: contactName,
        n: others
      });
    }else {
      nameContainer.innerHTML = contactName;
    }
    // Do we have to update photo?
    if (contact.photo && contact.photo[0]) {
      var photo = thread.getElementsByTagName('img')[0];
      var photoURL = URL.createObjectURL(contact.photo[0]);
      photo.src = photoURL;
    }
  },

  handleEvent: function thlui_handleEvent(evt) {
    switch (evt.type) {
      case 'click':
        if (evt.target.type == 'checkbox') {
          ThreadListUI.clickInput(evt.target);
          ThreadListUI.checkInputs();
        }
        break;
      case 'submit':
        evt.preventDefault();
        return false;
        break;
    }
  },

  clickInput: function thlui_clickInput(target) {
    if (target.checked) {
      ThreadListUI.selectedInputList.push(target);
    } else {
      ThreadListUI.selectedInputList.splice(
                ThreadListUI.selectedInputList.indexOf(target), 1);
    }
  },

  checkInputs: function thlui_checkInputs() {
    var selected = ThreadListUI.selectedInputList.length;
    var allInputs =
            ThreadListUI.view.querySelectorAll('input[type="checkbox"]');
    if (selected == allInputs.length) {
      ThreadListUI.selectAllButton.classList.add('disabled');
    } else {
      ThreadListUI.selectAllButton.classList.remove('disabled');
    }
    if (selected > 0) {
      ThreadListUI.deselectAllButton.classList.remove('disabled');
      ThreadListUI.deleteButton.classList.remove('disabled');
      this.pageHeader.innerHTML = _('selected', {n: selected});
    } else {
      ThreadListUI.deselectAllButton.classList.add('disabled');
      ThreadListUI.deleteButton.classList.add('disabled');
      this.pageHeader.innerHTML = _('editMode');
    }
  },

  cleanForm: function thlui_cleanForm() {
    var inputs = this.view.querySelectorAll('input[type="checkbox"]');
    for (var i = 0; i < inputs.length; i++) {
      inputs[i].checked = false;
      inputs[i].parentNode.parentNode.classList.remove('undo-candidate');
    }
    this.delNumList = [];
    this.selectedInputList = [];
    this.pageHeader.innerHTML = _('editMode');
    this.checkInputs();
  },

  selectAllThreads: function thlui_selectAllThreads() {
    var inputs =
            this.view.querySelectorAll('input[type="checkbox"]:not(:checked)');
    for (var i = 0; i < inputs.length; i++) {
      inputs[i].checked = true;
      ThreadListUI.clickInput(inputs[i]);
    }
    ThreadListUI.checkInputs();
  },

  deselectAllThreads: function thlui_deselectAllThreads() {
    var inputs = this.view.querySelectorAll('input[type="checkbox"]:checked');
    for (var i = 0; i < inputs.length; i++) {
      inputs[i].checked = false;
      ThreadListUI.clickInput(inputs[i]);
    }
    ThreadListUI.checkInputs();
  },

  executeDeletion: function thlui_executeDeletion() {
    var response = window.confirm(_('deleteThreads-confirmation2'));
    if (response) {
      WaitingScreen.show();
      var inputs = ThreadListUI.selectedInputList;
      var nums = inputs.map(function(input) {
        return input.value;
      });

      var filter = new MozSmsFilter();
      filter.numbers = nums;

      MessageManager.getMessages(function gotMessages(messages) {
        var delNumList = messages.map(function(message) {
          return message.id;
        });

        MessageManager.deleteMessages(delNumList,
                                      function() {
          MessageManager.getMessages(function recoverMessages(messages) {
            ThreadListUI.renderThreads(messages);
            WaitingScreen.hide();
            ThreadListUI.editDone = true;
            window.location.hash = '#thread-list';
          });
        });
      }, filter);

    }
  },

  cancelEditMode: function thlui_cancelEditMode() {
    window.location.hash = '#thread-list';
  },

  renderThreads: function thlui_renderThreads(messages, callback) {
    ThreadListUI.view.innerHTML = '';
    if (messages.length > 0) {
      document.getElementById('threads-fixed-container').
                                                    classList.remove('hide');
      FixedHeader.init('#thread-list-container',
                       '#threads-fixed-container',
                       'header');
      // Edit mode available
      ThreadListUI.iconEdit.classList.remove('disabled');
      var threadIds = [],
          dayHeaderIndex = 0,
          unreadThreads = [];
      for (var i = 0; i < messages.length; i++) {

        var message = messages[i];
        var time = message.timestamp.getTime();
        var num = message.delivery == 'received' ?
        message.sender : message.receiver;

        var numNormalized =
          PhoneNumberManager.getNormalizedInternationalNumber(num);
        if (!message.read) {
          if (unreadThreads.indexOf(numNormalized) == -1) {
            unreadThreads.push(numNormalized);
          }
        }
        if (threadIds.indexOf(numNormalized) == -1) {
          var thread = {
            'body': message.body,
            'name': numNormalized,
            'num': numNormalized,
            'timestamp': time,
            'unreadCount': !message.read ? 1 : 0,
            'id': numNormalized
          };
          if (threadIds.length == 0) {
            dayHeaderIndex = Utils.getDayDate(time);
            ThreadListUI.createNewHeader(time);
          }else {
            var tmpDayIndex = Utils.getDayDate(time);
            if (tmpDayIndex < dayHeaderIndex) {
              ThreadListUI.createNewHeader(time);
              dayHeaderIndex = tmpDayIndex;
            }
          }
          threadIds.push(numNormalized);
          ThreadListUI.appendThread(thread);
        }
      }
      // Update threads with 'unread' if some was missing
      for (var i = 0; i < unreadThreads.length; i++) {
         document.getElementById('thread_' + unreadThreads[i]).
                    getElementsByTagName('a')[0].classList.add('unread');
      }

      // Boot update of headers
      Utils.updateTimeHeaderScheduler();

    } else {
      document.getElementById('threads-fixed-container').classList.add('hide');
      var noResultHTML = '<div id="no-result-container">' +
            ' <div id="no-result-message">' +
            '   <p>' + _('noMessages-title') + '</p>' +
            '   <p>' + _('noMessages-text') + '</p>' +
            ' </div>' +
            '</div>';
      ThreadListUI.view.innerHTML = noResultHTML;
      ThreadListUI.iconEdit.classList.add('disabled');
    }
    // Callback when every message is appended
    if (callback) {
      callback();
    }
  },

  appendThread: function thlui_appendThread(thread) {
    // Retrieve ThreadsContainer
    var threadsContainerID = 'threadsContainer_' +
                              Utils.getDayDate(thread.timestamp);
    var threadsContainer = document.getElementById(threadsContainerID);

    if (!threadsContainer) {
      return;
    }
    // Create DOM element
    var threadDOM = document.createElement('li');
    threadDOM.id = 'thread_' + thread.num;

    // Retrieving params from thread
    var bodyText = (thread.body || '').split('\n')[0];
    var formattedDate = Utils.getFormattedHour(thread.timestamp);
    // Create HTML Structure
    var structureHTML = '<label class="danger">' +
                          '<input type="checkbox" value="' + thread.num + '">' +
                          '<span></span>' +
                        '</label>' +
                        '<a href="#num=' + thread.num +
                          '" class="' +
                          (thread.unreadCount > 0 ? 'unread' : '') + '">' +
                          '<aside class="icon icon-unread">unread</aside>' +
                          '<aside class="pack-end">' +
                            '<img src="">' +
                          '</aside>' +
                          '<p class="name">' + thread.num + '</p>' +
                          '<p><time>' + formattedDate +
                          '</time>' + bodyText + '</p>' +
                        '</a>';

    // Update HTML
    threadDOM.innerHTML = structureHTML;

    // Append Element
    threadsContainer.appendChild(threadDOM);

    // Get the contact data for the number
    ContactDataManager.getContactData(thread.num,
      function gotContact(contacts) {
      if (!contacts || !(contacts instanceof Array) || contacts.length < 1) {
        return;
      }
      // If there is contact with the phone number requested, we
      // update the info in the thread
      ThreadListUI.updateThreadWithContact(thread.num, contacts);
    });
  },

  // Adds a new grouping header if necessary (today, tomorrow, ...)
  createNewHeader: function thlui_createNewHeader(timestamp) {
    // Create Header DOM Element
    var headerDOM = document.createElement('header');
    // Append 'time-update' state
    headerDOM.dataset.timeUpdate = true;
    headerDOM.dataset.time = timestamp;

    // Create UL DOM Element
    var threadsContainerDOM = document.createElement('ul');
    threadsContainerDOM.id = 'threadsContainer_' +
                              Utils.getDayDate(timestamp);
    // Add text
    headerDOM.innerHTML = Utils.getHeaderDate(timestamp);

    // Add to DOM all elements
    ThreadListUI.view.appendChild(headerDOM);
    ThreadListUI.view.appendChild(threadsContainerDOM);

    // Refresh fixed header logic
    FixedHeader.refresh();
  }
};

var ThreadUI = {
  get view() {
    delete this.view;
    return this.view = document.getElementById('messages-container');
  },

  get contactInput() {
    delete this.contactInput;
    return this.contactInput = document.getElementById('receiver-input');
  },

  get clearButton() {
    delete this.clearButton;
    return this.clearButton = document.getElementById('clear-search');
  },

  get title() {
    delete this.title;
    return this.title = document.getElementById('header-text');
  },

  get input() {
    delete this.input;
    return this.input = document.getElementById('message-to-send');
  },

  get sendButton() {
    delete this.sendButton;
    return this.sendButton = document.getElementById('send-message');
  },

  get pickButton() {
    delete this.pickButton;
    return this.pickButton = document.getElementById('icon-contact');
  },

  get selectAllButton() {
    delete this.deleteAllButton;
    return this.deleteAllButton =
                                document.getElementById('select-all-messages');
  },

  get deselectAllButton() {
    delete this.deselectAllButton;
    return this.deselectAllButton =
                              document.getElementById('deselect-all-messages');
  },

  get deleteButton() {
    delete this.doneButton;
    return this.doneButton = document.getElementById('messages-delete-button');
  },

  get cancelButton() {
    delete this.cancelButton;
    return this.cancelButton =
                              document.getElementById('messages-cancel-button');
  },

  get pageHeader() {
    delete this.pageHeader;
    return this.pageHeader = document.getElementById('messages-edit-title');
  },

  get editForm() {
    delete this.editForm;
    return this.editForm = document.getElementById('messages-edit-form');
  },

  get telForm() {
    delete this.telForm;
    return this.telForm = document.getElementById('messages-tel-form');
  },

  get sendForm() {
    delete this.sendForm;
    return this.sendForm = document.getElementById('new-sms-form');
  },

  // Does the operator force 7-bit encoding
  is7BitEncoding: false,

  init: function thui_init() {
    this.sendButton.addEventListener('click', this.sendMessage.bind(this));

    // Prevent sendbutton to hide the keyboard:
    this.sendButton.addEventListener('mousedown',
      function btnDown(event) {
        event.preventDefault();
        event.target.classList.add('active');
      }
    );
    this.sendButton.addEventListener('mouseup',
      function btnUp(event) {
        event.target.classList.remove('active');
      }
    );
    this.sendButton.addEventListener('mouseout',
      function mouseOut(event) {
        event.target.classList.remove('active');
      }
    );

    this.pickButton.addEventListener('click', this.pickContact.bind(this));
    this.selectAllButton.addEventListener('click',
      this.selectAllMessages.bind(this));
    this.deselectAllButton.addEventListener('click',
      this.deselectAllMessages.bind(this));
    this.cancelButton.addEventListener('click', this.cancelEditMode.bind(this));
    this.input.addEventListener('input', this.updateInputHeight.bind(this));
    this.input.addEventListener('input', this.enableSend.bind(this));
    this.contactInput.addEventListener('input', this.searchContact.bind(this));
    this.contactInput.addEventListener('input', this.enableSend.bind(this));
    this.deleteButton.addEventListener('click',
                                       this.executeDeletion.bind(this));
    this.title.addEventListener('click', this.activateContact.bind(this));
    this.clearButton.addEventListener('click', this.clearContact.bind(this));
    this.view.addEventListener('click', this);
    this.editForm.addEventListener('submit', this);
    this.telForm.addEventListener('submit', this);
    this.sendForm.addEventListener('submit', this);

    var self = this;
    SettingsListener.observe('ril.sms.strict7BitEncoding.enabled',
                             function onSMSEncodingChange(value) {
      self.is7BitEncoding = !!value;
    });
  },

  enableSend: function thui_enableSend() {
    if (window.location.hash == '#new' && this.contactInput.value.length == 0) {
      this.sendButton.disabled = true;
      this.updateCounter();
      return;
    }

    this.sendButton.disabled = !(this.input.value.length > 0);
    this.updateCounter();
  },

  scrollViewToBottom: function thui_scrollViewToBottom(animateFromPos) {
    if (!animateFromPos) {
      this.view.scrollTop = this.view.scrollHeight;
      return;
    }

    clearInterval(this.viewScrollingTimer);
    this.view.scrollTop = animateFromPos;
    this.viewScrollingTimer = setInterval((function scrollStep() {
      var view = this.view;
      var height = view.scrollHeight - view.offsetHeight;
      if (view.scrollTop === height) {
        clearInterval(this.viewScrollingTimer);
        return;
      }
      view.scrollTop += Math.ceil((height - view.scrollTop) / 2);
    }).bind(this), 100);
  },

  has7BitOnlyCharacters: function thui_has7BitOnluCharacter(value) {
    for (var i = 0; i < value.length; i++) {
      if (value.charCodeAt(i) >= 128) {
        return false;
      }
    }

    return true;
  },

  updateCounter: function thui_updateCount(evt) {
    var value = this.input.value;

    // In theory the maximum concatenated number of SMS is 255.
    var kMaxConcatenatedMessages = 255;
    var excessive = false;

    // A sms can hold 140 bytes of data or 134 bytes of data depending
    // if it is a single or concatenated sms. To be fun the numbers of
    // sms also depends on the character encoding of the message.
    if (this.is7BitEncoding || this.has7BitOnlyCharacters(value)) {
      var kMaxCharsIfSingle = 160; // (140 * 8) / 7 = 160.
      var kMaxCharsIfMultiple = 153; // ((140 - 6) / 7 ~= 153.
    } else {
      var kMaxCharsIfSingle = 70; // (140 * 8) / 16 = 70.
      var kMaxCharsIfMultiple = 67; // ((140 - 6) / 16 = 67.
    }

    var counter = '';
    var length = value.length;
    if ((length / kMaxCharsIfSingle) > 1) {
      var charsLeft = kMaxCharsIfMultiple - (length % kMaxCharsIfMultiple);
      var smsCount = Math.ceil(length / kMaxCharsIfMultiple);
      counter = charsLeft + '/' + smsCount;

      // Make sure the current number of sms is not bigger than the maximum
      // theorical number of sms that can be concatenate.
      if (smsCount > kMaxConcatenatedMessages) {
        excessive = true;
      }
    }

    this.sendButton.dataset.counter = counter;
    this.sendButton.disabled = excessive;
  },

  updateInputHeight: function thui_updateInputHeight() {
    var input = this.input;
    var inputCss = window.getComputedStyle(input, null);
    var inputMaxHeight = parseInt(inputCss.getPropertyValue('max-height'), 10);
    //Constant difference of height beteween button and growing input
    var deviationHeight = 30;
    if (input.scrollHeight > inputMaxHeight) {
      return;
    }

    input.style.height = null;
    // If the scroll height is smaller than original offset height, we keep
    // offset height to keep original height, otherwise we use scroll height
    // with additional margin for preventing scroll bar.
    input.style.height = input.offsetHeight > input.scrollHeight ?
      input.offsetHeight / Utils.getFontSize() + 'rem' :
      input.scrollHeight / Utils.getFontSize() + 'rem';

    var newHeight = input.getBoundingClientRect().height;

    // Add 0.7 rem that are equal to the message box vertical padding
    var bottomToolbarHeight = (newHeight / Utils.getFontSize() + 0.7) + 'rem';
    var sendButtonTranslate = (input.offsetHeight - deviationHeight) /
      Utils.getFontSize() + 'rem';
    var bottomToolbar =
        document.querySelector('#new-sms-form');

    bottomToolbar.style.height = bottomToolbarHeight;
    ThreadUI.sendButton.style.marginTop = sendButtonTranslate;
    this.view.style.bottom = bottomToolbarHeight;
    this.scrollViewToBottom();
  },
  // Adds a new grouping header if necessary (today, tomorrow, ...)
  createTimeHeader: function thui_createTimeHeader(timestamp, hourOnly) {
    // Create DOM Element for header
    var headerDOM = document.createElement('header');
    // Append 'time-update' state
    headerDOM.dataset.timeUpdate = true;
    headerDOM.dataset.time = timestamp;
    // Add text
    var content;
    if (!hourOnly) {
      content = Utils.getHeaderDate(timestamp) + ' ' +
                Utils.getFormattedHour(timestamp);
    } else {
      content = Utils.getFormattedHour(timestamp);
      headerDOM.dataset.hourOnly = 'true';
    }
    headerDOM.innerHTML = content;
    // Append to DOM
    ThreadUI.view.appendChild(headerDOM);

    // Create list element for ul
    var messagesContainerDOM = document.createElement('ul');

    // Append to DOM
    ThreadUI.view.appendChild(messagesContainerDOM);

  },
  // Method for updating the header with the info retrieved from Contacts API
  updateHeaderData: function thui_updateHeaderData() {
    var number = MessageManager.currentNum;
    var self = this;
    // Add data to contact activity interaction
    this.title.dataset.phoneNumber = number;

    ContactDataManager.getContactData(number, function gotContact(contacts) {
      var carrierTag = document.getElementById('contact-carrier');
      /** If we have more than one contact sharing the same phone number
       *  we show the name of the first contact and how many other contacts
       *  share that same number. We thing it's user's responsability to correct
       *  this mess with the agenda.
       */
      if (contacts.length > 1) {
        self.title.dataset.isContact = true;
        var contactName = contacts[0].name;
        var numOthers = contacts.length - 1;
        self.title.innerHTML = _('others', {
          name: contactName,
          n: numOthers
        });
        carrierTag.classList.add('hide');
      } else {
        Utils.getPhoneDetails(number,
                              contacts[0],
                              function returnedDetails(details) {
          if (details.isContact) {
            self.title.dataset.isContact = true;
          } else {
            delete self.title.dataset.isContact;
          }
          self.title.innerHTML = details.title || number;
          if (details.carrier) {
            carrierTag.innerHTML = details.carrier;
            carrierTag.classList.remove('hide');
          } else {
            carrierTag.classList.add('hide');
          }
        });
      }
    });
  },

  renderMessages: function thui_renderMessages(messages, callback) {
    // Clean fields
    ThreadUI.cleanFields();
    // Reset vars for 'Deleting'
    ThreadUI.delNumList = [];
    ThreadUI.checkInputs();
    // Update Header
    ThreadUI.updateHeaderData();
    // Clean list of messages
    ThreadUI.view.innerHTML = '';
    // Update header index
    ThreadUI.dayHeaderIndex = 0;
    ThreadUI.timeHeaderIndex = 0;
    // Init readMessages array
    ThreadUI.readMessages = [];
    // Per each message I will append DOM element
    messages.forEach(ThreadUI.appendMessage);
    // Update read messages if necessary
    if (ThreadUI.readMessages.length > 0) {
      MessageManager.markMessagesRead(ThreadUI.readMessages, 'true',
        function() {
        MessageManager.getMessages(ThreadListUI.renderThreads);
      });
    }
    // Boot update of headers
    Utils.updateTimeHeaderScheduler();
    // Callback when every message is appended
    if (callback) {
      callback();
    }
  },

  appendMessage: function thui_appendMessage(message) {
    if (!message.read) {
      ThreadUI.readMessages.push(message.id);
    }
    // Retrieve all data from message
    var id = message.id;
    var bodyText = message.body;
    var bodyHTML = Utils.escapeHTML(bodyText);

    var messageClass = message.delivery;

    var messageDOM = document.createElement('li');
    messageDOM.classList.add('bubble');
    messageDOM.id = 'message-' + id;

    var inputValue = id;

    var asideHTML = '';
    // Do we have to add some error/sending icon?
    switch (message.delivery) {
      case 'error':
        asideHTML = '<aside class="pack-end"></aside>';
        ThreadUI.addResendHandler(message, messageDOM);
        break;
      case 'sending':
        asideHTML = '<aside class="pack-end">' +
                        '<progress></progress></aside>';
        break;
    }

    // Create HTML content
    var messageHTML = '<label class="danger">' +
                        '<input type="checkbox" value="' + inputValue + '">' +
                        '<span></span>' +
                      '</label>' +
                      '<a class="' + messageClass + '">';
    messageHTML += asideHTML;
    messageHTML += '<p>' + bodyHTML + '</p></a>';

    // Add structure to DOM element
    messageDOM.innerHTML = messageHTML;

    //Check if we need a new header
    var timestamp = message.timestamp.getTime();
    var tmpDayIndex = Utils.getDayDate(timestamp);
    var tmpHourIndex = timestamp;

    if (tmpDayIndex > ThreadUI.dayHeaderIndex) { // Different day
      ThreadUI.createTimeHeader(timestamp);
      ThreadUI.dayHeaderIndex = tmpDayIndex;
      ThreadUI.timeHeaderIndex = tmpHourIndex;
    } else { // Same day
      if (tmpHourIndex > ThreadUI.timeHeaderIndex + 10 * 60 * 1000) { // 10min
        ThreadUI.createTimeHeader(timestamp, true);
        ThreadUI.timeHeaderIndex = tmpHourIndex;
      }
    }
    // Append element
    ThreadUI.view.lastChild.appendChild(messageDOM);
    // Scroll to bottom
    ThreadUI.scrollViewToBottom();
  },

  addResendHandler: function thui_addResendHandler(message, messageDOM) {
    messageDOM.addEventListener('click', function resend(e) {
      var hash = window.location.hash;
      if (hash != '#edit') {
        var resendConfirmStr = _('resend-confirmation');
        var result = confirm(resendConfirmStr);
        if (result) {
          messageDOM.removeEventListener('click', resend);
          ThreadUI.resendMessage(message, messageDOM);
        }
      }
    });
  },

  cleanForm: function thui_cleanForm() {
    // Reset all inputs
    var inputs = this.view.querySelectorAll('input[type="checkbox"]');
    for (var i = 0; i < inputs.length; i++) {
      inputs[i].checked = false;
      inputs[i].parentNode.parentNode.classList.remove('undo-candidate');
    }
    // Reset vars for deleting methods
    this.checkInputs();
  },

  clearContact: function thui_clearContact() {
    this.contactInput.value = '';
    this.view.innerHTML = '';
  },

  selectAllMessages: function thui_selectAllMessages() {
    var inputs =
            this.view.querySelectorAll('input[type="checkbox"]:not(:checked)');
    for (var i = 0; i < inputs.length; i++) {
      inputs[i].checked = true;
      ThreadUI.chooseMessage(inputs[i]);
    }
    ThreadUI.checkInputs();
  },

  deselectAllMessages: function thui_deselectAllMessages() {
    var inputs =
            this.view.querySelectorAll('input[type="checkbox"]:checked');
    for (var i = 0; i < inputs.length; i++) {
      inputs[i].checked = false;
      ThreadUI.chooseMessage(inputs[i]);
    }
    ThreadUI.checkInputs();
  },

  executeDeletion: function thui_executeDeletion() {
    var response = window.confirm(_('deleteMessages-confirmation'));
    if (response) {
      WaitingScreen.show();
      var delNumList = [];
      var inputs =
        ThreadUI.view.querySelectorAll('input[type="checkbox"]:checked');
      for (var i = 0; i < inputs.length; i++) {
        delNumList.push(parseInt(inputs[i].value, 10));
      }

      // Method for deleting all inputs selected
      var deleteMessages = function() {
        MessageManager.getMessages(ThreadListUI.renderThreads,
                                           null, null, function() {
          var completeDeletionDone = false;
          // Then sending/received messages
          for (var i = 0; i < inputs.length; i++) {
            var message = inputs[i].parentNode.parentNode;
            var messagesContainer = message.parentNode;
            // Is the last message in the container?
            if (messagesContainer.childNodes.length == 1) {
              var header = messagesContainer.previousSibling;
              ThreadUI.view.removeChild(header);
              ThreadUI.view.removeChild(messagesContainer);
              if (!ThreadUI.view.childNodes.length) {
                var mainWrapper = document.getElementById('main-wrapper');
                mainWrapper.classList.remove('edit');
                window.location.hash = '#thread-list';
                WaitingScreen.hide();
                completeDeletionDone = true;
                break;
              }
            } else {
              messagesContainer.removeChild(message);
            }
          }
          if (!completeDeletionDone) {
            window.history.back();
            WaitingScreen.hide();
          }
        });
      };

      MessageManager.deleteMessages(delNumList, deleteMessages);
    }
  },

  cancelEditMode: function thlui_cancelEditMode() {
    window.history.go(-1);
  },

  chooseMessage: function thui_chooseMessage(target) {
    if (!target.checked) {
      // Removing red bubble
      target.parentNode.parentNode.classList.remove('selected');
    } else {
      // Adding red bubble
      target.parentNode.parentNode.classList.add('selected');
    }
  },

  checkInputs: function thui_checkInputs() {
    var selected = this.view.querySelectorAll('input[type="checkbox"]:checked');
    var allInputs = this.view.querySelectorAll('input[type="checkbox"]');

    if (selected.length == allInputs.length) {
      ThreadUI.selectAllButton.classList.add('disabled');
    } else {
      ThreadUI.selectAllButton.classList.remove('disabled');
    }
    if (selected.length > 0) {
      ThreadUI.deselectAllButton.classList.remove('disabled');
      ThreadUI.deleteButton.classList.remove('disabled');
      this.pageHeader.innerHTML = _('selected', {n: selected.length});
    } else {
      ThreadUI.deselectAllButton.classList.add('disabled');
      ThreadUI.deleteButton.classList.add('disabled');
      this.pageHeader.innerHTML = _('editMode');
    }
  },

  handleEvent: function thui_handleEvent(evt) {
    switch (evt.type) {
      case 'click':
        if (window.location.hash != '#edit') {
          return;
        }
        var inputs = evt.target.parentNode.getElementsByTagName('input');
        if (inputs && inputs.length > 0) {
          ThreadUI.chooseMessage(inputs[0]);
          ThreadUI.checkInputs();
        }
        break;
      case 'submit':
        evt.preventDefault();
        return false;
        break;
    }
  },

  cleanFields: function thui_cleanFields() {
    this.sendButton.disabled = true;
    this.contactInput.value = '';
    this.input.value = '';
    this.updateInputHeight();
  },

  sendMessage: function thui_sendMessage(resendText) {
    var num, text;

    if (resendText && (typeof(resendText) === 'string') && resendText !== '') {
      num = MessageManager.currentNum;
      text = resendText;
    } else {
      // Retrieve num depending on hash
      var hash = window.location.hash;
      // Depending where we are, we get different num
      if (hash == '#new') {
        num = this.contactInput.value;
        if (!num) {
          return;
        }
      } else {
        num = MessageManager.currentNum;
      }

      // Retrieve text
      text = this.input.value;
      if (!text) {
        return;
      }
    }
    // Clean fields (this lock any repeated click in 'send' button)
    this.cleanFields();

    // Retrieve normalized phone number
    // TODO Remove with
    // https://bugzilla.mozilla.org/show_bug.cgi?id=811539
    var numNormalized =
      PhoneNumberManager.getNormalizedInternationalNumber(num);

    MessageManager.currentNum = numNormalized;
    this.updateHeaderData();

    MessageManager.send(numNormalized, text);

    if (window.location.hash == '#new') {
      // If we are in 'new' we go to the right thread
      window.location.hash = '#num=' + numNormalized;
    }
  },

  onMessageSent: function thui_onMessageSent(message) {
    var messageDOM = document.getElementById('message-' + message.id);

    // Remove 'sending' style
    var aElement = messageDOM.querySelector('a');
    aElement.classList.remove('sending');
    // Remove the 'spinner'
    var spinnerContainer = aElement.querySelector('aside');
    aElement.removeChild(spinnerContainer);
  },

  onMessageFailed: function thui_onMessageFailed(message) {
    var messageDOM = document.getElementById('message-' + message.id);

    // Remove 'sending' style and add 'error' style
    var aElement = messageDOM.querySelector('a');
    aElement.classList.remove('sending');
    aElement.classList.add('error');

    // remove only the spinner
    var spinnerContainer = aElement.querySelector('aside');
    spinnerContainer.innerHTML = '';

    ThreadUI.addResendHandler(message, messageDOM);

    this.ifRilDisabled(this.showAirplaneModeError);
  },

  ifRilDisabled: function thui_ifRilDisabled(func) {
    var settings = window.navigator.mozSettings;

    if (settings) {
      // Check if RIL is enabled or not
      var req = settings.createLock().get('ril.radio.disabled');
      req.addEventListener('success', function onsuccess() {
        var rilDisabled = req.result['ril.radio.disabled'];
        rilDisabled && func();
      });
    }
  },

  showAirplaneModeError: function thui_showAirplaneModeError() {
    CustomDialog.show(
      _('sendAirplaneModeTitle'),
      _('sendAirplaneModeBody'),
      {
        title: _('sendAirplaneModeBtnOk'),
        callback: function() {
          CustomDialog.hide();
        }
      }
    );
  },

  resendMessage: function thui_resendMessage(message, messageDOM) {
    // Is the last one in the ul?
    var messagesContainer = messageDOM.parentNode;
    if (messagesContainer.childNodes.length == 1) {
      // If it is, we remove header & container
      var header = messagesContainer.previousSibling;
      ThreadUI.view.removeChild(header);
      ThreadUI.view.removeChild(messagesContainer);
    } else {
      // If not we only have to remove the message
      messageDOM.parentNode.removeChild(messageDOM);
    }

    // Have we more elements in the view?
    if (!ThreadUI.view.childNodes.length) {
      // Update header index
      ThreadUI.dayHeaderIndex = 0;
      ThreadUI.timeHeaderIndex = 0;
    }

    // delete from Gecko db as well
    if (message.id) {
      MessageManager.deleteMessage(message.id);
    }

    // We resend again
    ThreadUI.sendMessage(message.body);
  },

  renderContactData: function thui_renderContactData(contact) {
    // Retrieve info from thread
    var self = this;
    var tels = contact.tel;
    var contactsContainer = document.createElement('ul');
    contactsContainer.classList.add('contactList');
    for (var i = 0; i < tels.length; i++) {
      Utils.getPhoneDetails(tels[i].value,
                            contact,
                            function gotDetails(details) {
        var name = (contact.name || details.title).toString();
        //TODO ask UX if we should use type+carrier or just number
        var number = tels[i].value.toString();
        var input = self.contactInput.value;
        // For name, as long as we do a startsWith on API, we want only to show
        // highlight of the startsWith also
        var regName = new RegExp('\\b' + input, 'ig');
        // For number we search in any position to avoid country code issues
        var regNumber = new RegExp(input, 'ig');
        if (!(name.match(regName) || number.match(regNumber))) {
          return;
        }
        var nameHTML =
            SearchUtils.createHighlightHTML(name, regName, 'highlight');
        var numHTML =
            SearchUtils.createHighlightHTML(number, regNumber, 'highlight');
        // Create DOM element
        var contactDOM = document.createElement('li');

        // Do we have to update with photo?
        if (contact.photo && contact.photo[0]) {
          var photoURL = URL.createObjectURL(contact.photo[0]);
        }

        // Create HTML structure
        var structureHTML =
                '  <a href="#num=' + number + '">' +
                '<aside class="pack-end">' +
                  '<img ' + (photoURL ? 'src="' + photoURL + '"' : '') + '>' +
                '</aside>' +
                '    <p class="name">' + nameHTML + '</div>' +
                '    <p>' +
                      tels[i].type +
                      ' ' + numHTML +
                      ' ' + (tels[i].carrier ? tels[i].carrier : '') +
                '    </p>' +
                '  </a>';
        // Update HTML and append
        contactDOM.innerHTML = structureHTML;

        contactsContainer.appendChild(contactDOM);
      });
    }

    ThreadUI.view.appendChild(contactsContainer);
  },

  searchContact: function thui_searchContact() {
    var input = this.contactInput;
    var string = input.value;
    var self = this;
    self.view.innerHTML = '';
    if (!string) {
      return;
    }
    var contactsContainer = document.createElement('ul');

    ContactDataManager.searchContactData(string, function gotContact(contacts) {
      self.view.innerHTML = '';
      if (!contacts || contacts.length == 0) {



        var contactDOM = document.createElement('li');
        var noResultHTML = '<a><p data-10ln-id="no-results">' +
                           'No results returned' +
                           '</p></a>';
        contactDOM.innerHTML = noResultHTML;
        contactsContainer.appendChild(contactDOM);
        self.view.appendChild(contactsContainer);
        return;
      }
      contacts.forEach(self.renderContactData.bind(self));
    });
  },

  pickContact: function thui_pickContact() {
    try {
      var activity = new MozActivity({
        name: 'pick',
        data: {
          type: 'webcontacts/contact'
        }
      });
      activity.onsuccess = function success() {
        var number = this.result.number;
        if (number) {
          window.location.hash = '#num=' + number;
        }
      };
    } catch (e) {
      console.log('WebActivities unavailable? : ' + e);
    }
  },

  activateContact: function thui_activateContact() {
    var options = {};
    // Call to 'new' or 'view' depending on existence of contact
    if (this.title.dataset.isContact == 'true') {
      //TODO modify this when 'view' activity is available on contacts
      // options = {
      //   name: 'view',
      //   data: {
      //     type: 'webcontacts/contact'
      //   }
      // };
    } else {
      options = {
        name: 'new',
        data: {
          type: 'webcontacts/contact',
          params: {
            'tel': this.title.dataset.phoneNumber
          }
        }
      };
    }

    try {
      var activity = new MozActivity(options);
    } catch (e) {
      console.log('WebActivities unavailable? : ' + e);
    }
  }
};

var WaitingScreen = {
  get loading() {
    delete this.loading;
    return this.loading = document.getElementById('loading');
  },
  get loadingHeader() {
    delete this.loadingHeader;
    return this.loadingHeader = document.getElementById('loading-header');
  },
  show: function ws_show() {
    this.loading.classList.add('show-loading');
  },
  hide: function ws_hide() {
    this.loading.classList.remove('show-loading');
  },
  update: function ws_update(text) {
    this.loadingHeader.innerHTML = text;
  }
};

window.addEventListener('resize', function resize() {
   // Scroll to bottom
    ThreadUI.scrollViewToBottom();
});

window.addEventListener('localized', function showBody() {
  if (!MessageManager.initialized) {
    MessageManager.init();
  }

  // Set the 'lang' and 'dir' attributes to <html> when the page is translated
  document.documentElement.lang = navigator.mozL10n.language.code;
  document.documentElement.dir = navigator.mozL10n.language.direction;
});

function showThreadFromSystemMessage(number) {
  var showAction = function act_action(number) {
    var currentLocation = window.location.hash;
    switch (currentLocation) {
      case '#thread-list':
        window.location.hash = '#num=' + number;
        delete MessageManager.lockActivity;
        break;
      case '#new':
        window.location.hash = '#num=' + number;
        delete MessageManager.lockActivity;
        break;
      case '#edit':
        history.back();
        showAction(number);
        break;
      default:
        if (currentLocation.indexOf('#num=') != -1) {
          // Don't switch back to thread list if we're
          // already displaying the requested number.
          if (currentLocation == '#num=' + number) {
            delete MessageManager.lockActivity;
          } else {
            MessageManager.activityTarget = number;
            window.location.hash = '#thread-list';
          }
        } else {
          window.location.hash = '#num=' + number;
          delete MessageManager.lockActivity;
        }
        break;
    }
  };

  if (!document.documentElement.lang) {
    window.addEventListener('localized', function waitLocalized() {
      window.removeEventListener('localized', waitLocalized);
      showAction(number);
    });
  } else {
    if (!document.mozHidden) {
      // Case of calling from Notification
      showAction(number);
      return;
    }
    document.addEventListener('mozvisibilitychange',
      function waitVisibility() {
        document.removeEventListener('mozvisibilitychange', waitVisibility);
        showAction(number);
    });
  }
}

window.navigator.mozSetMessageHandler('activity', function actHandle(activity) {
  if (!MessageManager.initialized) {
    MessageManager.init();
  }
  // XXX This lock is about https://github.com/mozilla-b2g/gaia/issues/5405
  if (MessageManager.lockActivity)
    return;
  MessageManager.lockActivity = true;
  activity.postResult({ status: 'accepted' });
  var number = activity.source.data.number;
  showThreadFromSystemMessage(number);
});

/* === Incoming SMS support === */

// We want to register the handler only when we're on the launch path
if (!window.location.hash.length) {
  window.navigator.mozSetMessageHandler('sms-received',
    function smsReceived(message) {
    // The black list includes numbers for which notifications should not
    // progress to the user. Se blackllist.js for more information.
    var number = message.sender;
    // Class 0 handler:
    if (message.messageClass == 'class-0') {
      // XXX: Hack hiding the message class in the icon URL
      // Should use the tag element of the notification once the final spec
      // lands:
      // See: https://bugzilla.mozilla.org/show_bug.cgi?id=782211
      navigator.mozApps.getSelf().onsuccess = function(evt) {
        var app = evt.target.result;
        var iconURL = NotificationHelper.getIconURI(app);

        // XXX: Add params to Icon URL.
        iconURL += '?class0';
        var messageBody = number + '\n' + message.body;
        var showMessage = function() {
          app.launch();
          alert(messageBody);
        };

        // We have to remove the SMS due to it does not have to be shown.
        MessageManager.deleteMessage(message.id, function() {
          // Once we remove the sms from DB we launch the notification
          NotificationHelper.send(message.sender, message.body,
                                    iconURL, showMessage);
        });

      };
      return;
    }
    if (BlackList.has(message.sender))
      return;

    // The SMS app is already displayed
    if (!document.mozHidden) {
      var currentThread = MessageManager.currentNum;
      // If we are in the same thread, only we need to vibrate
      if (number == currentThread) {
        navigator.vibrate([200, 200, 200]);
        return;
      }
    }

    PhoneNumberManager.init(function phoneNMReady() {
      navigator.mozApps.getSelf().onsuccess = function(evt) {
        var app = evt.target.result;
        var iconURL = NotificationHelper.getIconURI(app);

        // Stashing the number at the end of the icon URL to make sure
        // we get it back even via system message
        iconURL += '?sms-received?' + number;

        var goToMessage = function() {
          app.launch();
          showThreadFromSystemMessage(number);
        };

        ContactDataManager.getContactData(message.sender,
        function gotContact(contact) {
          var sender;
          if (contact.length && contact[0].name) {
            sender = contact[0].name;
          } else {
            sender = message.sender;
          }

          NotificationHelper.send(sender, message.body, iconURL, goToMessage);
        });
      };
    });
  });

  window.navigator.mozSetMessageHandler('notification',
    function notificationClick(message) {
    navigator.mozApps.getSelf().onsuccess = function(evt) {
      var app = evt.target.result;
      app.launch();

      // Getting back the number form the icon URL
      var notificationType = message.imageURL.split('?')[1];
      // Case regular 'sms-received'
      if (notificationType == 'sms-received') {
        var number = message.imageURL.split('?')[2];
        showThreadFromSystemMessage(number);
        return;
      }
      var number = message.title;
      // Class 0 message
      var messageBody = number + '\n' + message.body;
      alert(messageBody);
    };
  });
}

