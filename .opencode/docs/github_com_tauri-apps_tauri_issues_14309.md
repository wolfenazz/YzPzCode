# [bug] monaco editor need some clipboard permission?? · Issue #14309 · tauri-apps/tauri · GitHub

> Source: https://github.com/tauri-apps/tauri/issues/14309
> Cached: 2026-08-12T19:09:43.100Z

---

Uh oh!

              There was an error while loading. [Please reload this page]().

  
  

    

  

  

      

        
            
  
      
    

    
    
      
        tauri-apps
    
    /
    
      [tauri](/tauri-apps/tauri)
    

    Public
  

        

        
            

    
        
          
  
  
    
  
    
      

              Uh oh!

              There was an error while loading. [Please reload this page]().

  
  

        

      

  
                
    
Notifications
    You must be signed in to change notification settings

  

  
              
    
Fork
    3.9k

  

  
        
            
    

          Star
          110k

  

        
      

        

          

  

      
  
    
              
    

        Code
          

    

      
  
    
              
    

        Issues
          1.3k

    

      
  
    
              
    

        Pull requests
          151

    

      
  
    
              
    

        Discussions
          

    

      
  
    
              
    

        Actions
          

    

      
  
    
              
    

        Projects
          

    

      
  
    
              
    

        Security and quality
          8

    

      
  
    
              
    

        Insights
          

    

          
  
      
    

Additional navigation options

  
    
                
  
    

        
    
    
    
        
          
    

        
      
        
          Code
      

  

        
    
    
    
        
          
    

        
      
        
          Issues
      

  

        
    
    
    
        
          
    

        
      
        
          Pull requests
      

  

        
    
    
    
        
          
    

        
      
        
          Discussions
      

  

        
    
    
    
        
          
    

        
      
        
          Actions
      

  

        
    
    
    
        
          
    

        
      
        
          Projects
      

  

        
    
    
    
        
          
    

        
      
        
          Security and quality
      

  

        
    
    
    
        
          
    

        
      
        
          Insights
      

  

    

      
  

  
  

    
    

    
      
    

  

  
  
  # [bug] monaco editor need some clipboard permission?? #14309

New issueCopy linkNew issueCopy linkClosedClosed[[bug] monaco editor need some clipboard permission??](#top)#14309Copy linkLabels[status: needs triageThis issue needs to triage, applied to new issues](https://github.com/tauri-apps/tauri/issues?q=state%3Aopen%20label%3A%22status%3A%20needs%20triage%22)This issue needs to triage, applied to new issues[type: bug](https://github.com/tauri-apps/tauri/issues?q=state%3Aopen%20label%3A%22type%3A%20bug%22)## Description

[](https://github.com/yuyang-ok)[yuyang-ok](https://github.com/yuyang-ok)opened [on Oct 16, 2025](https://github.com/tauri-apps/tauri/issues/14309#issue-3519963374)Issue body actions### Describe the bug

when typing monaco editor give me this error

[](https://private-user-images.githubusercontent.com/96557710/501774196-6c887c98-3d8f-4b13-94b6-aa5119e2a14b.png?jwt=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJnaXRodWIuY29tIiwiYXVkIjoicmF3LmdpdGh1YnVzZXJjb250ZW50LmNvbSIsImtleSI6ImtleTUiLCJleHAiOjE3ODY1NjIwODIsIm5iZiI6MTc4NjU2MTc4MiwicGF0aCI6Ii85NjU1NzcxMC81MDE3NzQxOTYtNmM4ODdjOTgtM2Q4Zi00YjEzLTk0YjYtYWE1MTE5ZTJhMTRiLnBuZz9YLUFtei1BbGdvcml0aG09QVdTNC1ITUFDLVNIQTI1NiZYLUFtei1DcmVkZW50aWFsPUFLSUFWQ09EWUxTQTUzUFFLNFpBJTJGMjAyNjA4MTIlMkZ1cy1lYXN0LTElMkZzMyUyRmF3czRfcmVxdWVzdCZYLUFtei1EYXRlPTIwMjYwODEyVDE5MDk0MlomWC1BbXotRXhwaXJlcz0zMDAmWC1BbXotU2lnbmF0dXJlPWViNWZiZDgzNzI2MDM3OTU2ODJhNjFhZTZiZmUzMWJmZWUzZGUzNmNlMmY2NmI2MWEzNmUwY2IyYTllNDU4NzYmWC1BbXotU2lnbmVkSGVhZGVycz1ob3N0JnJlc3BvbnNlLWNvbnRlbnQtdHlwZT1pbWFnZSUyRnBuZyJ9.lLwWQv-JNvNFvqIZT_O0j6KBAE59nO4Rep5KU-mZGmE)
### Reproduction

[https://github.com/yuyang-ok/tauri-monaco-editor-clipboard-service](https://github.com/yuyang-ok/tauri-monaco-editor-clipboard-service)

I use the project to test.
### Expected behavior

*No response*

### Full `tauri info` output

```
pnpm tauri info 

> tauri-monaco-editor-clipboard@0.1.0 tauri /home/yuyang/projects/tauri-monaco-editor-clipboard
> tauri info

[✔] Environment
    - OS: Ubuntu 24.4.0 x86_64 (X64) (ubuntu on wayland)
    ✔ webkit2gtk-4.1: 2.48.7
    ✔ rsvg2: 2.58.0
    ✔ rustc: 1.92.0-nightly (fa3155a64 2025-09-30)
    ✔ cargo: 1.92.0-nightly (f2932725b 2025-09-24)
    ✔ rustup: 1.28.2 (e4f3ad6f8 2025-04-28)
    ✔ Rust toolchain: nightly-x86_64-unknown-linux-gnu (default)
    - node: 22.20.0
    - pnpm: 10.17.1
    - yarn: 1.22.22
    - npm: 10.9.3

[-] Packages
    - tauri 🦀: 2.8.5
    - tauri-build 🦀: 2.4.1
    - wry 🦀: 0.53.4
    - tao 🦀: 0.34.3
    - @tauri-apps/api : 2.8.0
    - @tauri-apps/cli : 2.8.4

[-] Plugins
    - tauri-plugin-clipboard-manager 🦀: 2.3.0
    - @tauri-apps/plugin-clipboard-manager : 2.3.0
    - tauri-plugin-opener 🦀: 2.5.0
    - @tauri-apps/plugin-opener : 2.5.0

[-] App
    - build-type: bundle
    - CSP: unset
    - frontendDist: ../dist
    - devUrl: http://localhost:1421/
    - framework: React
    - bundler: Vite

```

### Stack trace

```

```

### Additional context

*No response*

Reactions are currently unavailable## Metadata

## Metadata

### Assignees

No one assigned

### Labels

[status: needs triageThis issue needs to triage, applied to new issues](https://github.com/tauri-apps/tauri/issues?q=state%3Aopen%20label%3A%22status%3A%20needs%20triage%22)This issue needs to triage, applied to new issues[type: bug](https://github.com/tauri-apps/tauri/issues?q=state%3Aopen%20label%3A%22type%3A%20bug%22)### Type

No type### Projects

No projects### Milestone

No milestone

### Relationships

None yet### Development

No branches or pull requests## Issue actions

- Open in GitHub Copilot app