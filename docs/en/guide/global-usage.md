# Global Usage (Run from Any Directory)


If you want to run `machelper` directly from any project directory, set up one of the following. Once configured, `machelper` will automatically recognize your current working directory.

## macOS / Linux

Add to `~/.bashrc` or `~/.zshrc`:

```bash
# Option 1: Add to PATH (recommended)
export PATH="$HOME/path/to/machelper/bin:$PATH"

# Option 2: Alias
alias machelper="$HOME/path/to/machelper/bin/machelper"
```

Then reload the config:

```bash
source ~/.bashrc  # or source ~/.zshrc
```

## Windows (Git Bash)

Add to `~/.bashrc`:

```bash
export PATH="$HOME/path/to/machelper/bin:$PATH"
```

## Verify

After setup, navigate to any project directory and test:

```bash
cd ~/your-other-project
machelper
# Ask "What is the current directory?" — it should show ~/your-other-project
```
