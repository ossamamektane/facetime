# The app's own native part: rings planned calls on the real iPhone call screen (CallKit).
Pod::Spec.new do |s|
  s.name           = 'FakeCall'
  s.version        = '1.0.0'
  s.summary        = 'Rings planned calls on the real iPhone call screen.'
  s.description    = 'Local Expo module of the Calls app: CallKit calls, answer audio, missed-call notices.'
  s.license        = { :type => 'MIT' }
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true
  s.swift_version  = '5.4'

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'CallKit', 'AVFoundation', 'UserNotifications', 'Intents', 'UIKit'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,swift}"
end
