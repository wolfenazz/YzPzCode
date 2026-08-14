# GitHub - huchenlei/stable-diffusion-ps-pea: Use Stable Diffusion in Photopea! · GitHub

> Source: https://github.com/huchenlei/stable-diffusion-ps-pea
> Cached: 2026-08-14T13:04:40.182Z

---

[](https://private-user-images.githubusercontent.com/20929282/257030473-b015ba09-3fee-42e6-b907-b957ec1a0e60.png?jwt=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJnaXRodWIuY29tIiwiYXVkIjoicmF3LmdpdGh1YnVzZXJjb250ZW50LmNvbSIsImtleSI6ImtleTUiLCJleHAiOjE3ODY3MTI5NzksIm5iZiI6MTc4NjcxMjY3OSwicGF0aCI6Ii8yMDkyOTI4Mi8yNTcwMzA0NzMtYjAxNWJhMDktM2ZlZS00MmU2LWI5MDctYjk1N2VjMWEwZTYwLnBuZz9YLUFtei1BbGdvcml0aG09QVdTNC1ITUFDLVNIQTI1NiZYLUFtei1DcmVkZW50aWFsPUFLSUFWQ09EWUxTQTUzUFFLNFpBJTJGMjAyNjA4MTQlMkZ1cy1lYXN0LTElMkZzMyUyRmF3czRfcmVxdWVzdCZYLUFtei1EYXRlPTIwMjYwODE0VDEzMDQzOVomWC1BbXotRXhwaXJlcz0zMDAmWC1BbXotU2lnbmF0dXJlPTg1OGRjMDFmNzhhYzlhNDE1ZTBjOWM2OGQzZWFkMWJiZTExYWE3NjQ4ZDU1ODcyZjNjODhkNTMyNDViODAxMmUmWC1BbXotU2lnbmVkSGVhZGVycz1ob3N0JnJlc3BvbnNlLWNvbnRlbnQtdHlwZT1pbWFnZSUyRnBuZyJ9.vl9SaBxu1LeFhGsfraVqMU6iCZXThl50MCL2yFlXINM)
# Stable Diffusion Photopea

[](#stable-diffusion-photopea)
Stable Diffusion plugin for Photopea based on A1111 API.

[Changelog](/huchenlei/stable-diffusion-ps-pea/blob/main/CHANGELOG.md) · [Report Bug](/huchenlei/stable-diffusion-ps-pea/blob/main/issues-url) · [Request Feature](/huchenlei/stable-diffusion-ps-pea/blob/main/issues-url)

[](https://discord.gg/GkaWcUat7R)

## Installation

[](#installation)
**Step1: Setup backend service**
Set following command line arguments in `webui-user.bat`:
set COMMANDLINE_ARGS=--api --cors-allow-origins https://huchenlei.github.io [Rest of ARGS...]
For SDNext(V1111) users, set following arguments:

set COMMANDLINE_ARGS=--cors-origins https://huchenlei.github.io [Rest of ARGS...]
**Step2: Click Window>Plugin**
[](https://private-user-images.githubusercontent.com/20929282/255208123-a91df408-76c6-4300-8987-41f7971379a5.png?jwt=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJnaXRodWIuY29tIiwiYXVkIjoicmF3LmdpdGh1YnVzZXJjb250ZW50LmNvbSIsImtleSI6ImtleTUiLCJleHAiOjE3ODY3MTI5NzksIm5iZiI6MTc4NjcxMjY3OSwicGF0aCI6Ii8yMDkyOTI4Mi8yNTUyMDgxMjMtYTkxZGY0MDgtNzZjNi00MzAwLTg5ODctNDFmNzk3MTM3OWE1LnBuZz9YLUFtei1BbGdvcml0aG09QVdTNC1ITUFDLVNIQTI1NiZYLUFtei1DcmVkZW50aWFsPUFLSUFWQ09EWUxTQTUzUFFLNFpBJTJGMjAyNjA4MTQlMkZ1cy1lYXN0LTElMkZzMyUyRmF3czRfcmVxdWVzdCZYLUFtei1EYXRlPTIwMjYwODE0VDEzMDQzOVomWC1BbXotRXhwaXJlcz0zMDAmWC1BbXotU2lnbmF0dXJlPWY3NGYxZDAzMmFlNTFmODBjMmE4YjM1NDU3Nzc5Njc4ODkyNmZiZGE5NjkzMjM5Y2Y4OTYyNjMyYWM3Y2QxNGEmWC1BbXotU2lnbmVkSGVhZGVycz1ob3N0JnJlc3BvbnNlLWNvbnRlbnQtdHlwZT1pbWFnZSUyRnBuZyJ9.Wb9XvDDy1jrWdpYoI6jAvn5xgjtv4qWVNSzns-zXwGg)
**Step3: Search for stable-diffusion-ps-pea**
[](https://private-user-images.githubusercontent.com/20929282/256937065-35c2b802-4f31-45c2-8a24-e55f621adfae.png?jwt=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJnaXRodWIuY29tIiwiYXVkIjoicmF3LmdpdGh1YnVzZXJjb250ZW50LmNvbSIsImtleSI6ImtleTUiLCJleHAiOjE3ODY3MTI5NzksIm5iZiI6MTc4NjcxMjY3OSwicGF0aCI6Ii8yMDkyOTI4Mi8yNTY5MzcwNjUtMzVjMmI4MDItNGYzMS00NWMyLThhMjQtZTU1ZjYyMWFkZmFlLnBuZz9YLUFtei1BbGdvcml0aG09QVdTNC1ITUFDLVNIQTI1NiZYLUFtei1DcmVkZW50aWFsPUFLSUFWQ09EWUxTQTUzUFFLNFpBJTJGMjAyNjA4MTQlMkZ1cy1lYXN0LTElMkZzMyUyRmF3czRfcmVxdWVzdCZYLUFtei1EYXRlPTIwMjYwODE0VDEzMDQzOVomWC1BbXotRXhwaXJlcz0zMDAmWC1BbXotU2lnbmF0dXJlPWFiMjQ4NTY3NjY1Y2QwZWY5NjA4OGUzYTgwMmI5NzZiZjg1NGNiYjc2NzQ3Nzg0NzA3ZGVhYWRiNDBiYjJjMTMmWC1BbXotU2lnbmVkSGVhZGVycz1ob3N0JnJlc3BvbnNlLWNvbnRlbnQtdHlwZT1pbWFnZSUyRnBuZyJ9.qkeg4JQoZhfXnULhRVoKPUdDKBn-lZufcgpSkr9QYRM)
## Features

[](#features)
##### 🔥[New Feature][2023-11-26] Realtime rendering powered by [LCM](https://github.com/luosiallen/latent-consistency-model)

[](#firenew-feature2023-11-26-realtime-rendering-powered-by-lcm)
Recent advancement in LCM(Latent Consistency Model) has significantly increased the speed of
inference of stable diffusion. The inference time now can be so fast that we can do real-time
rendering of the canvas.
Some preparations before you start exploring the real-time rendering tab:

- Make sure to download the latest version of [`config_sharing/huchenlei_configs.json5`](https://github.com/huchenlei/stable-diffusion-ps-pea/blob/main/public/config/huchenlei_configs.json5) and upload it in the config tab. The new config file provides `lcm_base`, `lcm_lora_sd15`, `lcm_sd15_scribble` configs that are necessary.

- Make sure you have LCM LoRA named `lcm_lora_sd15.safetensor` in A1111. Or you can change the name of LoRA in config `lcm_lora_sd15`. You can download LCM LoRAs [here](https://huggingface.co/collections/latent-consistency/latent-consistency-models-loras-654cdd24e111e16f0865fba6).

After these preparations, you can now navigate to the real-time render tab (📹).

- Select `lcm_base`, `lcm_lora_sd15` in RealtimeConfig.

- Start drawing on canvas and enjoy!

Other features:

- If you have any selections on canvas, LCM will only render the selected area.

- You can add `lcm_sd15_scribble` to RealtimeConfig, which will invoke ControlNet scribble model on canvas content. Make sure you have solid black brush color active when scribbling.

- You can click `Send to canvas` to send the rendered view to canvas.

[](https://private-user-images.githubusercontent.com/20929282/285685407-0d53c264-6f74-42e2-9581-ba98a6b021ba.jpg?jwt=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJnaXRodWIuY29tIiwiYXVkIjoicmF3LmdpdGh1YnVzZXJjb250ZW50LmNvbSIsImtleSI6ImtleTUiLCJleHAiOjE3ODY3MTI5NzksIm5iZiI6MTc4NjcxMjY3OSwicGF0aCI6Ii8yMDkyOTI4Mi8yODU2ODU0MDctMGQ1M2MyNjQtNmY3NC00MmUyLTk1ODEtYmE5OGE2YjAyMWJhLmpwZz9YLUFtei1BbGdvcml0aG09QVdTNC1ITUFDLVNIQTI1NiZYLUFtei1DcmVkZW50aWFsPUFLSUFWQ09EWUxTQTUzUFFLNFpBJTJGMjAyNjA4MTQlMkZ1cy1lYXN0LTElMkZzMyUyRmF3czRfcmVxdWVzdCZYLUFtei1EYXRlPTIwMjYwODE0VDEzMDQzOVomWC1BbXotRXhwaXJlcz0zMDAmWC1BbXotU2lnbmF0dXJlPTk1ODYxNDMyYTU3YzI3ZTVlYjJkNWQ4MTBkNmFkZWEyNjMzMDBmM2FiYjE4YTJjM2E3NTVlMTQwNTk1NmNjMGYmWC1BbXotU2lnbmVkSGVhZGVycz1ob3N0JnJlc3BvbnNlLWNvbnRlbnQtdHlwZT1pbWFnZSUyRmpwZWcifQ.wsUvhadXzfdOevaQVVUdn2vXVdD2EMIWl8AwsJCTGoA)
[](https://private-user-images.githubusercontent.com/20929282/285689014-fd0a0139-c61f-449d-8e1a-e00575acdda9.gif?jwt=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJnaXRodWIuY29tIiwiYXVkIjoicmF3LmdpdGh1YnVzZXJjb250ZW50LmNvbSIsImtleSI6ImtleTUiLCJleHAiOjE3ODY3MTI5NzksIm5iZiI6MTc4NjcxMjY3OSwicGF0aCI6Ii8yMDkyOTI4Mi8yODU2ODkwMTQtZmQwYTAxMzktYzYxZi00NDlkLThlMWEtZTAwNTc1YWNkZGE5LmdpZj9YLUFtei1BbGdvcml0aG09QVdTNC1ITUFDLVNIQTI1NiZYLUFtei1DcmVkZW50aWFsPUFLSUFWQ09EWUxTQTUzUFFLNFpBJTJGMjAyNjA4MTQlMkZ1cy1lYXN0LTElMkZzMyUyRmF3czRfcmVxdWVzdCZYLUFtei1EYXRlPTIwMjYwODE0VDEzMDQzOVomWC1BbXotRXhwaXJlcz0zMDAmWC1BbXotU2lnbmF0dXJlPWM5ZjM2NmNkZGMzYjk1YzJlNTM2NWRmNzhiODIyYjNiNGM0Zjk1YTQ3YzBhNjhjZDk4ZjllY2M1ZjkwZmY1ZDQmWC1BbXotU2lnbmVkSGVhZGVycz1ob3N0JnJlc3BvbnNlLWNvbnRlbnQtdHlwZT1pbWFnZSUyRmdpZiJ9.kofTge7FVDGZ9PWV8HjowS1aCzUod4UeAJrMq1ZX4Kw)
[](https://private-user-images.githubusercontent.com/20929282/285689766-6a2fed43-1630-4b11-b3f2-548216571b73.gif?jwt=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJnaXRodWIuY29tIiwiYXVkIjoicmF3LmdpdGh1YnVzZXJjb250ZW50LmNvbSIsImtleSI6ImtleTUiLCJleHAiOjE3ODY3MTI5NzksIm5iZiI6MTc4NjcxMjY3OSwicGF0aCI6Ii8yMDkyOTI4Mi8yODU2ODk3NjYtNmEyZmVkNDMtMTYzMC00YjExLWIzZjItNTQ4MjE2NTcxYjczLmdpZj9YLUFtei1BbGdvcml0aG09QVdTNC1ITUFDLVNIQTI1NiZYLUFtei1DcmVkZW50aWFsPUFLSUFWQ09EWUxTQTUzUFFLNFpBJTJGMjAyNjA4MTQlMkZ1cy1lYXN0LTElMkZzMyUyRmF3czRfcmVxdWVzdCZYLUFtei1EYXRlPTIwMjYwODE0VDEzMDQzOVomWC1BbXotRXhwaXJlcz0zMDAmWC1BbXotU2lnbmF0dXJlPTM5NDhiMjQxNWU0OWE2OTY1MzYwODVjOTgzOGZlMDIwNDFiODQ1NWZlMDVhZGViMGFkNTU5N2FiOTA4YWIzMTQmWC1BbXotU2lnbmVkSGVhZGVycz1ob3N0JnJlc3BvbnNlLWNvbnRlbnQtdHlwZT1pbWFnZSUyRmdpZiJ9.lx1YU4f-RYBudggGqIuk8IXj45BxCeSgUSRCyvjePVU)
...More documentation work in progress...

**Reference range selection**
In A1111 img2img inpaint, one painpoint is that the inpaint area selection is either `WholeImage` or `OnlyMasked`. This
might not be an issue when the image is within reasonable size (512x512). Once the image becomes big (1024x1024+), the
time and resouce required for inpaint area to be `WhileImage` grows exponentially, which makes this option not viable, but
sometimes we do want to reference a limited range of surroundings. In this situation, one need to crop the image in an
image editor, ask A1111 to only process the cropped image, then put the cropeed image back to the original big image.
This is a tedious process, but now we have this behaviour as default in `stable-diffusion-ps-pea`. Everytime you do an
img2img, optionally you can apply a reference range (%/px), or you can just manually specify the range by creating another
selection on canvas.
[](https://private-user-images.githubusercontent.com/20929282/256938022-951c2420-d5cd-4e65-bde2-45a0880ea73c.png?jwt=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJnaXRodWIuY29tIiwiYXVkIjoicmF3LmdpdGh1YnVzZXJjb250ZW50LmNvbSIsImtleSI6ImtleTUiLCJleHAiOjE3ODY3MTI5NzksIm5iZiI6MTc4NjcxMjY3OSwicGF0aCI6Ii8yMDkyOTI4Mi8yNTY5MzgwMjItOTUxYzI0MjAtZDVjZC00ZTY1LWJkZTItNDVhMDg4MGVhNzNjLnBuZz9YLUFtei1BbGdvcml0aG09QVdTNC1ITUFDLVNIQTI1NiZYLUFtei1DcmVkZW50aWFsPUFLSUFWQ09EWUxTQTUzUFFLNFpBJTJGMjAyNjA4MTQlMkZ1cy1lYXN0LTElMkZzMyUyRmF3czRfcmVxdWVzdCZYLUFtei1EYXRlPTIwMjYwODE0VDEzMDQzOVomWC1BbXotRXhwaXJlcz0zMDAmWC1BbXotU2lnbmF0dXJlPTRjMDNhMzBmYjdkYjE2MDEwNjQ0MjE1MDgxOWY0YWZlMDY1MmRlOGZhM2YwZmY1MjAwNzY2ZGFkNTMwMjVlZDkmWC1BbXotU2lnbmVkSGVhZGVycz1ob3N0JnJlc3BvbnNlLWNvbnRlbnQtdHlwZT1pbWFnZSUyRnBuZyJ9.IqUm_l31lEFqWml-TMmpuHW-gOpLuauj4te1UThFv28)

**Scale ratio**
In whole body generation, some body parts (hand/face) often becomes bad in quality, because there are just not enough
pixels for the diffusion model to add details to. The diffusion model also performs less well on aspect ratios other
than the ratios it was trained on (512x512 for SD1.5, 1024x1024 for SDXL), so doing inpaint in a small area only help
a little. The solution is simple here, when inpainting a small area, we let A1111 target a bigger area closer to diffusion
model's trained aspect ratio and resize the output to put the result image back to the original inpaint spot. The very
popular extension ADetailer is doing this exact process but using image detection models to automatically detect
face/hand/body to fix.
[](https://private-user-images.githubusercontent.com/20929282/256940081-41df7f23-f752-4477-8304-9e06f9725eb3.png?jwt=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJnaXRodWIuY29tIiwiYXVkIjoicmF3LmdpdGh1YnVzZXJjb250ZW50LmNvbSIsImtleSI6ImtleTUiLCJleHAiOjE3ODY3MTI5NzksIm5iZiI6MTc4NjcxMjY3OSwicGF0aCI6Ii8yMDkyOTI4Mi8yNTY5NDAwODEtNDFkZjdmMjMtZjc1Mi00NDc3LTgzMDQtOWUwNmY5NzI1ZWIzLnBuZz9YLUFtei1BbGdvcml0aG09QVdTNC1ITUFDLVNIQTI1NiZYLUFtei1DcmVkZW50aWFsPUFLSUFWQ09EWUxTQTUzUFFLNFpBJTJGMjAyNjA4MTQlMkZ1cy1lYXN0LTElMkZzMyUyRmF3czRfcmVxdWVzdCZYLUFtei1EYXRlPTIwMjYwODE0VDEzMDQzOVomWC1BbXotRXhwaXJlcz0zMDAmWC1BbXotU2lnbmF0dXJlPWE5ZmJmMGJiOGUwMTczNDI4MWU0N2RhNGM5MGFmZTg0OTZkOWExZDMwMjY0Y2I4OTliYWQxMjcxYWQxOWQzNzkmWC1BbXotU2lnbmVkSGVhZGVycz1ob3N0JnJlc3BvbnNlLWNvbnRlbnQtdHlwZT1pbWFnZSUyRnBuZyJ9.sglzoen3FfQa_EDCpAUz3fx2wpllXetyBK7stPLTXyc)

**ControlNet**
Majority of ControlNet models can be applied to a specific part of the image (canny, depth, openpose, etc). However,
in normal A1111 ControlNet UI, you cannot easily visualize the spatial relationship between each ControlNet unit.
One example is shown in following video. The author uses openpose to control body pose, and softedge to control hand
detail. Noting that he is using a image editor to edit the softedge map to keep only the hand part.
[](https://www.youtube.com/watch?v=UgVOQTjahxc)
This type of operation now becomes very easy in `stable-diffusion-ps-pea`. The ControlNet maps can easily overlay
on top of each other. Here I am using a openpose unit and a lineart unit.
[](https://private-user-images.githubusercontent.com/20929282/256951970-1834d24f-e994-41e6-ba19-01a1d0cd1655.png?jwt=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJnaXRodWIuY29tIiwiYXVkIjoicmF3LmdpdGh1YnVzZXJjb250ZW50LmNvbSIsImtleSI6ImtleTUiLCJleHAiOjE3ODY3MTI5NzksIm5iZiI6MTc4NjcxMjY3OSwicGF0aCI6Ii8yMDkyOTI4Mi8yNTY5NTE5NzAtMTgzNGQyNGYtZTk5NC00MWU2LWJhMTktMDFhMWQwY2QxNjU1LnBuZz9YLUFtei1BbGdvcml0aG09QVdTNC1ITUFDLVNIQTI1NiZYLUFtei1DcmVkZW50aWFsPUFLSUFWQ09EWUxTQTUzUFFLNFpBJTJGMjAyNjA4MTQlMkZ1cy1lYXN0LTElMkZzMyUyRmF3czRfcmVxdWVzdCZYLUFtei1EYXRlPTIwMjYwODE0VDEzMDQzOVomWC1BbXotRXhwaXJlcz0zMDAmWC1BbXotU2lnbmF0dXJlPTcxZWFiYjQ3N2QyM2NiNGRhYjgxYjY2NDIzNTUyOGVhMmVjZGQ2MmY0NTIxZjE2Mjc2Njk0ZjkwMDc1YmM0ODAmWC1BbXotU2lnbmVkSGVhZGVycz1ob3N0JnJlc3BvbnNlLWNvbnRlbnQtdHlwZT1pbWFnZSUyRnBuZyJ9.Tc8p6fA3es3L8krAXwhvLzONR73DebsNvKH0-wt688M)
[](https://private-user-images.githubusercontent.com/20929282/256951742-5dcb6d6f-5c3e-4cf8-abf6-c5223059a8af.png?jwt=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJnaXRodWIuY29tIiwiYXVkIjoicmF3LmdpdGh1YnVzZXJjb250ZW50LmNvbSIsImtleSI6ImtleTUiLCJleHAiOjE3ODY3MTI5NzksIm5iZiI6MTc4NjcxMjY3OSwicGF0aCI6Ii8yMDkyOTI4Mi8yNTY5NTE3NDItNWRjYjZkNmYtNWMzZS00Y2Y4LWFiZjYtYzUyMjMwNTlhOGFmLnBuZz9YLUFtei1BbGdvcml0aG09QVdTNC1ITUFDLVNIQTI1NiZYLUFtei1DcmVkZW50aWFsPUFLSUFWQ09EWUxTQTUzUFFLNFpBJTJGMjAyNjA4MTQlMkZ1cy1lYXN0LTElMkZzMyUyRmF3czRfcmVxdWVzdCZYLUFtei1EYXRlPTIwMjYwODE0VDEzMDQzOVomWC1BbXotRXhwaXJlcz0zMDAmWC1BbXotU2lnbmF0dXJlPWY5ZDc2YWU2MTE5MWZiYTE3NzlhZjAzZTlmMmJjMGRhYWYwMjkyNzBlYzRkNjcxZjhlYjg3N2RmYTVmOTAyNDUmWC1BbXotU2lnbmVkSGVhZGVycz1ob3N0JnJlc3BvbnNlLWNvbnRlbnQtdHlwZT1pbWFnZSUyRnBuZyJ9.SdFoTvpSl3oyCKuJ9HpFCVFlvSSa_LIj-SYKz4jL11g)
[](https://private-user-images.githubusercontent.com/20929282/256952066-1938eac3-4a11-4d6a-95c1-eda23be453ea.png?jwt=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJnaXRodWIuY29tIiwiYXVkIjoicmF3LmdpdGh1YnVzZXJjb250ZW50LmNvbSIsImtleSI6ImtleTUiLCJleHAiOjE3ODY3MTI5NzksIm5iZiI6MTc4NjcxMjY3OSwicGF0aCI6Ii8yMDkyOTI4Mi8yNTY5NTIwNjYtMTkzOGVhYzMtNGExMS00ZDZhLTk1YzEtZWRhMjNiZTQ1M2VhLnBuZz9YLUFtei1BbGdvcml0aG09QVdTNC1ITUFDLVNIQTI1NiZYLUFtei1DcmVkZW50aWFsPUFLSUFWQ09EWUxTQTUzUFFLNFpBJTJGMjAyNjA4MTQlMkZ1cy1lYXN0LTElMkZzMyUyRmF3czRfcmVxdWVzdCZYLUFtei1EYXRlPTIwMjYwODE0VDEzMDQzOVomWC1BbXotRXhwaXJlcz0zMDAmWC1BbXotU2lnbmF0dXJlPTc0OThiMjM1NTVmZGNjZWEyMjEwNWRlMjAwYmE0M2JkOGM0NWI0NTdmOWY0OTkxZGJhNzhkMjM4NWU2NWM3NTQmWC1BbXotU2lnbmVkSGVhZGVycz1ob3N0JnJlc3BvbnNlLWNvbnRlbnQtdHlwZT1pbWFnZSUyRnBuZyJ9.RlAGdz2srCK1R3EifwEHWRmfFOv-LXmW9zQCIdDOXiY)
Initial proposal to implement layer control in ControlNet's repo: [Issue #1736](https://github.com/Mikubill/sd-webui-controlnet/issues/1736).

**Config System**
One pain point about A1111 is that it is hard to define workflow. There are many configuration I wish can be restored
later when I was using A1111. So here I designed a configuration system that let users easily define workflow.
There are 3 types of config in `stable-diffusion-ps-pea`:

- Base: The config representing the hardcoded default values for each generation parameters.

Default: The default config when each time you enter the UI or click the `refresh` button at the bottom right corner.
Clicking the checkmark will activate the current selected config as default.
[](https://private-user-images.githubusercontent.com/20929282/256952372-207672ad-4dcb-4309-8459-be16e029905a.png?jwt=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJnaXRodWIuY29tIiwiYXVkIjoicmF3LmdpdGh1YnVzZXJjb250ZW50LmNvbSIsImtleSI6ImtleTUiLCJleHAiOjE3ODY3MTI5NzksIm5iZiI6MTc4NjcxMjY3OSwicGF0aCI6Ii8yMDkyOTI4Mi8yN

... [Content truncated]