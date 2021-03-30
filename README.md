# VSCode C++ Viewer
Displays a C++ project in the explorer by grouping each cpp, header, and test files.

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
        include/
            MainTest.h
```
Into:
```
src/
    Main
     - C++
     - Header
     - Test C++
     - Test Header
```


# Requirements
C++ Viewer only works with the following directory structure. Support for different file
structures may be added in the future.
```
src/
    main/
        cpp/
            cpp files...
        include/
            header files...
    test/
        cpp/
            test cpp files...
        include/
            test header files...
```