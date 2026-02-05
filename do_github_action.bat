REM This batch file is used to run a GitHub Action locally using act.
REM make new file named .secrets in the same directory as this batch file and add your secrets in the format:
REM SECRET_NAME=secret_value

act --secret-file .secrets
pause
