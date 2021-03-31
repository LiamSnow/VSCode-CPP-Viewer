# VSCode C++ Viewer
Displays an cleaner view of a C++ project in the Visual Studio Code explorer by grouping cpp and header files.

It will turn the following directory structure:
```
src/
    main/
        cpp/
            Main.cpp
        include/
            Main.h
    test/
        cpp/
            MainTest.cpp
CMake.txt
```
Into:
```
src/
    main/
        Main
    test/
        MainTest
CMake.txt
```


# Requirements
C++ Viewer works by finding a directory "split" where `cpp/` and `include/` (optional) exists. 
From there it will group the following files.
If only `cpp/` exists it will simply use the files inside, but when both `include/` exists it will only use
those files, and search for corresponding cpp files under `cpp/`. This means if you have a `include/` directory
cpp files that do not have corresponding header files will not be displayed. This may change in a future update.
```
src/
    main/
        cpp/
            Main.cpp
            Window.cpp <-- will not be displayed
        include/
            Main.h
            Constants.h <-- this is fine though
    test/
        cpp/
            MainTest.cpp
```