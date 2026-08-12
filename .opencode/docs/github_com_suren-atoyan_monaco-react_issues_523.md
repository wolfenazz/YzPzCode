# Intellisense stopped working when I tried to use node_modules version instead of CDN · Issue #523 · suren-atoyan/monaco-react · GitHub

> Source: https://github.com/suren-atoyan/monaco-react/issues/523
> Cached: 2026-08-12T19:11:23.195Z

---

suren-atoyan
    
    /
    
      [monaco-react](/suren-atoyan/monaco-react)
    

    Public
  

        

        
            

    
        
          
  
  
    
  
    
      

              Uh oh!

              There was an error while loading. [Please reload this page]().

  
  

        

      

  
                
    
Notifications
    You must be signed in to change notification settings

  

  
              
    
Fork
    321

  

  
        
            
    

          Star
          4.7k

  

        
      

        

          

  

      
  
    
              
    

        Code
          

    

      
  
    
              
    

        Issues
          10

    

      
  
    
              
    

        Pull requests
          11

    

      
  
    
              
    

        Discussions
          

    

      
  
    
              
    

        Actions
          

    

      
  
    
              
    

        Projects
          

    

      
  
    
              
    

        Security and quality
          0

    

      
  
    
              
    

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
      

  

    

      
  

  
  

    
    

    
      
    

  

  
  
  # Intellisense stopped working when I tried to use node_modules version instead of CDN #523

New issueCopy linkNew issueCopy linkClosed as not plannedClosed as not planned[Intellisense stopped working when I tried to use node_modules version instead of CDN](#top)#523Copy linkLabels[Stale](https://github.com/suren-atoyan/monaco-react/issues?q=state%3Aopen%20label%3A%22Stale%22)## Description

[](https://github.com/nanachi-code)[nanachi-code](https://github.com/nanachi-code)opened [on Aug 27, 2023](https://github.com/suren-atoyan/monaco-react/issues/523#issue-1868491006)Issue body actionsEverything works fine until I tried to setup the loader to use the node_modules version.

import * as monaco from "monaco-editor"
// both didnt work
loader.config({ monaco })
loader.config({
  paths: {
    vs: "node_modules/monaco-editor/min/vs"
  }
})

self.MonacoEnvironment = {
  getWorker(_, label) {
    console.log(label) //? this returns editorWorkerService

    if (label === "typescript" || label === "javascript") {
      return new tsWorker()
    }
    return new editorWorker()
  }
}

// ...
// no intellisense
 <MonacoEditor
          language="javascript" // here I specified to use js only
          path="script.js"
/>
I'm using monaco-editor 0.41.0, @monaco-editor/react 4.5.2, vite 4.4.4. This is on a tauri app if that's relevant.

Reactions are currently unavailable## Metadata

## Metadata

### Assignees

No one assigned

### Labels

[Stale](https://github.com/suren-atoyan/monaco-react/issues?q=state%3Aopen%20label%3A%22Stale%22)### Projects

No projects### Milestone

No milestone

### Relationships

None yet### Development

No branches or pull requests## Issue actions

- Open in GitHub Copilot app